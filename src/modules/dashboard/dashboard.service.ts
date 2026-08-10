import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from '../../schema/reservation/reservation.schema';

export interface KpiData {
  total: number;
  pending: number;
  confirmed: number;
  approved: number;
  rejected: number;
  completionRate: number;
  pendingRate: number;
  rejectionRate: number;
}

export interface WeeklyStats {
  dailyStats: number[];
  dayLabels: string[];
  totalWeekReservations: number;
  averagePerDay: number;
  peakDay: { day: string | null; count: number };
  trend: 'up' | 'down' | 'stable';
}

export interface TodayReservationsResponse {
  reservations: ReservationDocument[];
  count: number;
  byStatus: Record<ReservationStatus, number>;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(Reservation.name)
    readonly reservationModel: Model<ReservationDocument>,
  ) {}

  async getKpiData(): Promise<KpiData> {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const kpiResults = await this.reservationModel.aggregate([
        {
          $match: {
            reservationDate: { $gte: ninetyDaysAgo },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: {
                $cond: [{ $eq: ['$status', ReservationStatus.PENDING] }, 1, 0],
              },
            },
            confirmed: {
              $sum: {
                $cond: [
                  { $eq: ['$status', ReservationStatus.CONFIRMED] },
                  1,
                  0,
                ],
              },
            },
            approved: {
              $sum: {
                $cond: [{ $eq: ['$status', ReservationStatus.APPROVED] }, 1, 0],
              },
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ['$status', ReservationStatus.REJECTED] }, 1, 0],
              },
            },
          },
        },
      ]);

      const data = kpiResults[0] || {
        total: 0,
        pending: 0,
        confirmed: 0,
        approved: 0,
        rejected: 0,
      };

      const completionRate =
        data.total > 0
          ? ((data.approved + data.rejected) / data.total) * 100
          : 0;
      const pendingRate =
        data.total > 0 ? (data.pending / data.total) * 100 : 0;
      const rejectionRate =
        data.total > 0 ? (data.rejected / data.total) * 100 : 0;

      const dashboardData: KpiData = {
        ...data,
        completionRate: Math.round(completionRate * 100) / 100,
        pendingRate: Math.round(pendingRate * 100) / 100,
        rejectionRate: Math.round(rejectionRate * 100) / 100,
      };

      return dashboardData;
    } catch (error) {
      this.logger.error('Error fetching KPI data', error.stack);
      throw new Error('Failed to fetch KPI data');
    }
  }

  async getTodayReservations(): Promise<TodayReservationsResponse> {
    try {
      const { startDate: startOfDay, endDate: endOfDay } =
        this.getTodayDateRange();

      this.logger.log(
        `Fetching today's reservations from ${startOfDay} to ${endOfDay}`,
      );

      // Use reservationDate (not createdAt) — we want reservations FOR today, not booked today
      const [reservations, statusCounts] = await Promise.all([
        this.reservationModel
          .find({
            reservationDate: { $gte: startOfDay, $lte: endOfDay },
          })
          .sort({ reservationTime: 1 })
          .populate('userId', 'name email')
          .lean()
          .exec(),

        this.reservationModel.aggregate([
          {
            $match: {
              reservationDate: { $gte: startOfDay, $lte: endOfDay },
            },
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      // Format status counts
      const byStatus = statusCounts.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          return acc;
        },
        {} as Record<ReservationStatus, number>,
      );

      // Ensure all statuses are represented
      Object.values(ReservationStatus).forEach((status) => {
        if (!(status in byStatus)) {
          byStatus[status] = 0;
        }
      });

      return {
        reservations: reservations as ReservationDocument[],
        count: reservations.length,
        byStatus,
      };
    } catch (error) {
      this.logger.error("Error fetching today's reservations", error.stack);
      throw new Error("Failed to fetch today's reservations");
    }
  }

  async weeklyStats(): Promise<WeeklyStats> {
    try {
      const { startDate: startOfWeek, endDate: endOfWeek } =
        this.getWeekDateRange();

      this.logger.log(
        `Fetching weekly stats from ${startOfWeek} to ${endOfWeek}`,
      );

      const prevWeekStart = new Date(
        startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000,
      );

      // Use aggregation to count by day-of-week on reservationDate — no in-memory iteration
      const [dailyAgg, previousWeekTotal] = await Promise.all([
        this.reservationModel.aggregate([
          {
            $match: { reservationDate: { $gte: startOfWeek, $lte: endOfWeek } },
          },
          {
            $group: {
              // $dayOfWeek: 1=Sun, 2=Mon … 7=Sat; convert to JS 0-based by subtracting 1
              _id: { $subtract: [{ $dayOfWeek: '$reservationDate' }, 1] },
              count: { $sum: 1 },
            },
          },
        ]),
        this.reservationModel.countDocuments({
          reservationDate: { $gte: prevWeekStart, $lt: startOfWeek },
        }),
      ]);

      const dayLabels = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const dailyStats = Array(7).fill(0);
      let totalWeekReservations = 0;

      dailyAgg.forEach(({ _id, count }) => {
        if (_id >= 0 && _id <= 6) {
          dailyStats[_id] = count;
          totalWeekReservations += count;
        }
      });

      const averagePerDay = Math.round((totalWeekReservations / 7) * 100) / 100;

      const maxCount = Math.max(...dailyStats);
      const peakDay = {
        day: maxCount > 0 ? dayLabels[dailyStats.indexOf(maxCount)] : null,
        count: maxCount,
      };

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (totalWeekReservations > previousWeekTotal * 1.05) trend = 'up';
      else if (totalWeekReservations < previousWeekTotal * 0.95) trend = 'down';

      this.logger.log(
        `Weekly stats: ${totalWeekReservations} reservations, trend: ${trend}`,
      );

      return {
        dailyStats,
        dayLabels,
        totalWeekReservations,
        averagePerDay,
        peakDay,
        trend,
      };
    } catch (error) {
      this.logger.error('Error fetching weekly stats', error.message);
      throw new Error('Failed to fetch weekly statistics');
    }
  }

  // Helper methods for date calculations
  private getTodayDateRange(): DateRange {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return { startDate: startOfDay, endDate: endOfDay };
  }

  private getWeekDateRange(): DateRange {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    return { startDate: startOfWeek, endDate: endOfWeek };
  }
}
