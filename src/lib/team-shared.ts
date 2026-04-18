export interface TeamSpecialty {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  organizationId: string;
  name: string;
  specialtyId: string;
  specialtyName: string;
  specialtySlug: string;
  role: string;
  phone: string | null;
  email: string | null;
  available: boolean;
  notes: string | null;
  createdAt: string;
}
