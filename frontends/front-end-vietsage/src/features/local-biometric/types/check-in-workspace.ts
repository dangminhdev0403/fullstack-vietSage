export type CheckInWorkspaceRoom = {
  id: string;
  roomNumber: string;
  type?: string;
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
};

export type CheckInWorkspaceProps = {
  open: boolean;
  hotelId: string;
  room: CheckInWorkspaceRoom;
  canManageStays: boolean;
  initialStayFields?: Partial<CheckInStayFields>;
  submitState?: 'idle' | 'submitting' | 'error';
  submitError?: string;
  onSubmit: (fields: CheckInStayFields) => void;
  onClose: () => void;
};
