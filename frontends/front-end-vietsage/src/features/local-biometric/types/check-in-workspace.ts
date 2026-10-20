export type CheckInWorkspaceRoom = {
  id: string;
  roomNumber: string;
  type?: string;
  maxOccupancy?: number | null;
  status: string;
};

export type CheckInOccupantField = {
  fullName: string;
  phone?: string;
  identityNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  residencePlace?: string;
  isPrimary?: boolean;
};

export type CheckInStayFields = {
  guestDisplayName: string;
  guestPhone: string;
  plannedCheckOutAt: string;
  guestIdentityNumber?: string;
  guestDateOfBirth?: string;
  guestGender?: string;
  guestNationality?: string;
  guestResidencePlace?: string;
  occupants?: CheckInOccupantField[];
  reservationCode?: string;
  plannedCheckInAt?: string;
  notes?: string;
};

export type CheckInWorkspaceProps = {
  open: boolean;
  hotelId: string;
  room: CheckInWorkspaceRoom;
  canManageStays: boolean;
  enabledFeatures?: readonly string[];
  initialStayFields?: Partial<CheckInStayFields>;
  submitState?: 'idle' | 'submitting' | 'error';
  submitError?: string;
  onSubmit: (fields: CheckInStayFields) => void;
  onClose: () => void;
};
