export type TransportMode =
  | "flight"
  | "train"
  | "bus"
  | "ferry"
  | "car"
  | "motorbike"
  | "bicycle"
  | "walking"
  | "other";

export type TransportBooking = {
  id: string;
  tripId: string;
  activityId: string | null;
  mode: TransportMode;
  providerName: string | null;
  bookingReference: string | null;
  originName: string;
  destinationName: string;
  departureAt: string | null;
  arrivalAt: string | null;
  price: number | null;
  currency: string;
  bookingStatus: string;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  participantUserIds: string[];
};
