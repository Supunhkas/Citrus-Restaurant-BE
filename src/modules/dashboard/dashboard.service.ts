import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from 'src/schema/reservation/reservation.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Reservation.name)
    private reservationModel: Model<ReservationDocument>,

    private userService: UsersService,
  ) {}

  async getKpiData() {
    const totalUsers = await this.userService.countUsers();
    const totalReservations = await this.reservationModel.countDocuments();
    const today = new Date();
    const todayReservations = await this.reservationModel.countDocuments({
      reservationDate: today,
    });
    return {
      totalReservations,
      todayReservations,
      totalUsers,
    };
  }

  async getTodayStats() {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // First, aggregate basic stats and average pack size
    const stats = await this.reservationModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: '$reservationTime', // group by reservation time for peak calculation
          count: { $sum: 1 },
          totalGuests: { $sum: '$guests' },
        },
      },
      {
        $group: {
          _id: null,
          todayReservations: { $sum: '$count' },
          totalGuests: { $sum: '$totalGuests' },
          avgPackSize: { $avg: '$totalGuests' }, // average per reservation time
          peakTimeData: { $push: { time: '$_id', count: '$count' } },
        },
      },
    ]);

    const resultData = stats[0] || {
      todayReservations: 0,
      totalPendingReservations: 0,
      totalConfirmedReservations: 0,
      totalApprovedReservations: 0,
      totalRejectedReservations: 0,
      avgPackSize: 0,
      peakTime: null,
    };

    // Calculate peak time (time slot with max reservations)
    let peakTime = null;
    if (resultData.peakTimeData && resultData.peakTimeData.length > 0) {
      peakTime = resultData.peakTimeData.reduce((max, curr) =>
        curr.count > max.count ? curr : max,
      ).time;
    }

    // Optional: you can add status breakdown in a separate aggregation if needed
    const statusCounts = await this.reservationModel.aggregate([
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
    ]);

    const statusMap = {
      [ReservationStatus.PENDING]: 0,
      [ReservationStatus.CONFIRMED]: 0,
      [ReservationStatus.APPROVED]: 0,
      [ReservationStatus.REJECTED]: 0,
    };

    statusCounts.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    return {
      totalReservations: resultData.todayReservations,
      pendingReservations: statusMap[ReservationStatus.PENDING],
      confirmedReservations: statusMap[ReservationStatus.CONFIRMED],
      approvedReservations: statusMap[ReservationStatus.APPROVED],
      rejectedReservations: statusMap[ReservationStatus.REJECTED],
      avgPartySize:
        resultData.todayReservations > 0
          ? resultData.totalGuests / resultData.todayReservations
          : 0,
      peakTime,
    };
  }
}
