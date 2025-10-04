import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from 'src/schema/reservation/reservation.schema';
import { UsersService } from '../users/users.service';

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
  peakDay: { day: string; count: number };
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
    private reservationModel: Model<ReservationDocument>,
    private userService: UsersService,
  ) {}

  async getKpiData(): Promise<KpiData> {
    console.log('Fetching KPI data');
    try {
      this.logger.log('Fetching KPI data');

      const kpiResults = await this.reservationModel.aggregate([
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

      this.logger.log(
        `KPI data fetched successfully: ${data.total} total reservations`,
      );
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

      const [reservations, statusCounts] = await Promise.all([
        this.reservationModel
          .find({
            createdAt: { $gte: startOfDay, $lte: endOfDay },
          })
          .sort({ reservationTime: 1 })
          .populate('userId', 'name email') // Assuming you want user details
          .lean()
          .exec(),

        // Get status breakdown for today
        this.reservationModel.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfDay, $lte: endOfDay },
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

      this.logger.log(`Found ${reservations.length} reservations for today`);

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

      // Get current week data
      const [currentWeekReservations, previousWeekReservations] =
        await Promise.all([
          this.reservationModel
            .find({
              createdAt: { $gte: startOfWeek, $lte: endOfWeek },
            })
            .select('createdAt')
            .lean()
            .exec(),

          // Get previous week for trend comparison
          this.reservationModel
            .find({
              createdAt: {
                $gte: new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000),
                $lt: startOfWeek,
              },
            })
            .select('createdAt')
            .lean()
            .exec(),
        ]);

      // Initialize daily stats and labels
      const dailyStats = Array(7).fill(0);
      const dayLabels = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];

      // Count reservations by day
      currentWeekReservations.forEach((reservation: any) => {
        const day = new Date(reservation.createdAt).getDay();
        dailyStats[day]++;
      });

      // Calculate metrics
      const totalWeekReservations = currentWeekReservations.length;
      const averagePerDay = Math.round((totalWeekReservations / 7) * 100) / 100;

      // Find peak day
      const maxCount = Math.max(...dailyStats);
      const peakDayIndex = dailyStats.indexOf(maxCount);
      const peakDay = {
        day: dayLabels[peakDayIndex],
        count: maxCount,
      };

      // Calculate trend compared to previous week
      const previousWeekTotal = previousWeekReservations.length;
      let trend: 'up' | 'down' | 'stable' = 'stable';

      if (totalWeekReservations > previousWeekTotal * 1.05) {
        // 5% threshold
        trend = 'up';
      } else if (totalWeekReservations < previousWeekTotal * 0.95) {
        trend = 'down';
      }

      this.logger.log(
        `Weekly stats calculated: ${totalWeekReservations} reservations, trend: ${trend}`,
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
      this.logger.error('Error fetching weekly stats', error.stack);
      throw new Error('Failed to fetch weekly statistics');
    }
  }

  async monthlyStats(month?: number, year?: number): Promise<any> {
    try {
      const { startDate: startOfMonth, endDate: endOfMonth } =
        this.getMonthDateRange(month, year);

      this.logger.log(
        `Fetching monthly stats for ${startOfMonth.getFullYear()}-${startOfMonth.getMonth() + 1}`,
      );

      const monthlyData = await this.reservationModel.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: {
              day: { $dayOfMonth: '$createdAt' },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.day',
            total: { $sum: '$count' },
            byStatus: {
              $push: {
                status: '$_id.status',
                count: '$count',
              },
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      const daysInMonth = new Date(
        startOfMonth.getFullYear(),
        startOfMonth.getMonth() + 1,
        0,
      ).getDate();

      // Fill missing days with zero
      const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const existingData = monthlyData.find((d) => d._id === day);

        if (existingData) {
          const statusBreakdown = {};
          existingData.byStatus.forEach((item) => {
            statusBreakdown[item.status] = item.count;
          });

          return {
            day,
            total: existingData.total,
            byStatus: statusBreakdown,
          };
        }

        return {
          day,
          total: 0,
          byStatus: {},
        };
      });

      return {
        month: startOfMonth.getMonth() + 1,
        year: startOfMonth.getFullYear(),
        dailyData,
        totalReservations: dailyData.reduce((sum, day) => sum + day.total, 0),
      };
    } catch (error) {
      this.logger.error('Error fetching monthly stats', error.stack);
      throw new Error('Failed to fetch monthly statistics');
    }
  }

  async getReservationsByDateRange(
    startDate: Date,
    endDate: Date,
    status?: ReservationStatus,
  ): Promise<ReservationDocument[]> {
    try {
      const query: any = {
        createdAt: { $gte: startDate, $lte: endDate },
      };

      if (status) {
        query.status = status;
      }

      return await this.reservationModel
        .find(query)
        .sort({ createdAt: -1 })
        .populate('userId', 'name email')
        .lean()
        .exec();
    } catch (error) {
      this.logger.error(
        'Error fetching reservations by date range',
        error.stack,
      );
      throw new Error('Failed to fetch reservations by date range');
    }
  }

  async getDashboardSummary(): Promise<any> {
    try {
      this.logger.log('Fetching complete dashboard summary');

      const [kpiData, todayReservations, weeklyStats] = await Promise.all([
        this.getKpiData(),
        this.getTodayReservations(),
        this.weeklyStats(),
      ]);

      return {
        kpi: kpiData,
        today: todayReservations,
        weekly: weeklyStats,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error('Error fetching dashboard summary', error.stack);
      throw new Error('Failed to fetch dashboard summary');
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

  private getMonthDateRange(month?: number, year?: number): DateRange {
    const now = new Date();
    const targetMonth = month ?? now.getMonth();
    const targetYear = year ?? now.getFullYear();

    const startOfMonth = new Date(targetYear, targetMonth, 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(targetYear, targetMonth + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return { startDate: startOfMonth, endDate: endOfMonth };
  }
}
