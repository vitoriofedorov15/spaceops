export interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'dispatcher' | 'admin';
}
export interface Floor {
  id: string;
  number: number;
  name: string;
}
export interface Equipment {
  id: string;
  name: string;
  category: string;
  state: 'working' | 'broken' | 'repair';
  inventory_number?: string;
  space_id?: string;
  space_name?: string;
  floor_number?: number;
}
export interface Space {
  id: string;
  name: string;
  floor_id: string;
  floor_number: number;
  type: 'room' | 'desk';
  capacity: number;
  archived: boolean;
  geometry: { x: number; y: number; width: number; height: number };
  equipment: Equipment[];
  occupied: boolean;
  blocked: boolean;
  open_tickets: number;
  schedule?: Booking[];
  blocks?: Block[];
}
export interface Booking {
  id: string;
  space_id: string;
  space_name: string;
  title: string;
  comment: string;
  starts_at: string;
  ends_at: string;
  attendees: number;
  status: 'active' | 'cancelled';
  needs_relocation: boolean;
  version: number;
  user_id: string | null;
  requirements: string[];
  floor_number: number;
}
export interface Block {
  id: string;
  space_id: string;
  space_name: string;
  starts_at: string;
  ends_at: string;
  reason: string;
}
export interface Proposal {
  id: string;
  booking_id: string;
  user_id: string;
  space_id: string;
  space_name: string;
  original_space_name: string;
  title: string;
  starts_at: string;
  ends_at: string;
}
export interface Ticket {
  id: string;
  space_id: string;
  space_name: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  author_id: string;
  author_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
  equipment_id: string | null;
  equipment_name: string | null;
  comments?: { id: string; author_name: string; body: string; created_at: string }[];
  history?: History[];
}
export interface History {
  id: string;
  action: string;
  actor: string;
  created_at: string;
  changes: Record<string, unknown>;
}
export interface Notification {
  id: string;
  message: string;
  type: string;
  entity_id: string;
  created_at: string;
  read_at: string | null;
}
export const equipmentLabels: Record<string, string> = {
  display: 'Display',
  whiteboard: 'Whiteboard',
  projector: 'Projector',
  monitor: 'Monitor',
};
export const ticketLabels: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const roleLabels: Record<string, string> = {
  employee: 'Employee',
  dispatcher: 'Dispatcher',
  admin: 'Administrator',
};
export const stateLabels: Record<string, string> = {
  working: 'Working',
  broken: 'Out of order',
  repair: 'Under repair',
};
export const auditLabels: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.updated': 'Booking updated',
  'booking.cancelled': 'Booking cancelled',
  'booking.affected_by_block': 'Space restricted — relocation needed',
  'booking.availability_restored': 'Space availability restored',
  'booking.relocation_proposed': 'Relocation proposed',
  'booking.relocation_accepted': 'Relocation accepted',
  'booking.relocation_rejected': 'Relocation declined',
  'ticket.created': 'Ticket created',
  'ticket.updated': 'Status or assignee updated',
  'ticket.commented': 'Comment added',
};
