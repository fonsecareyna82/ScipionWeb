export interface UserProfile {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    institution?: string;
    phone?: string;
    position?: string;
    country?: string;
    city?: string;
    postalCode?: string;
    role?: string;
    isVerified?: boolean;
  }