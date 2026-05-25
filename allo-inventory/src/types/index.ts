// src/types/index.ts
// Shared type definitions for API responses and domain objects

export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";

export interface ProductWithInventory {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  imageUrl: string | null;
  inventories: InventoryWithWarehouse[];
}

export interface InventoryWithWarehouse {
  id: string;
  warehouseId: string;
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
  quantity: number;
  reserved: number;
  available: number; // computed: quantity - reserved
}

export interface ReservationWithDetails {
  id: string;
  status: ReservationStatus;
  quantity: number;
  expiresAt: string; // ISO string for serialization
  createdAt: string;
  updatedAt: string;
  customerEmail: string | null;
  inventory: {
    id: string;
    product: {
      id: string;
      name: string;
      sku: string;
      imageUrl: string | null;
    };
    warehouse: {
      id: string;
      name: string;
      location: string;
    };
  };
  auditLogs: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  event: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WarehouseDto {
  id: string;
  name: string;
  location: string;
  createdAt: string;
}

export interface DashboardMetrics {
  totalProducts: number;
  totalWarehouses: number;
  activeReservations: number;
  confirmedReservations: number;
  expiredReservations: number;
  totalInventoryUnits: number;
}
