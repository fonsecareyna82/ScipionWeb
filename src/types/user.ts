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
    // What the user may do: the permissions of their roles and of their groups' roles
    permissions?: string[];
    isSystemAdmin?: boolean;
  }