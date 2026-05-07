export interface User {
  id: string;
  email: string;
  name: string;
  schoolDomain: string;
  picture?: string;
  createdAt: Date;
  lastLoginAt: Date;
}
