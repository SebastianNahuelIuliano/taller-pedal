
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const TOKEN_KEY = 'taller_pedal_token'

export interface User {
  id: string
  fullName: string
  email: string
  phone: string | null
  role: 'CLIENTE' | 'MECANICO' | 'ADMINISTRADOR'
  isActive: boolean
  createdAt?: string
}

export interface Bicycle {
  id: string
  brand: string
  model: string
  bicycle_type: string
  serial_number: string | null
  observations: string | null
  created_at: string
}

export interface BicycleInput {
  brand: string
  model: string
  bicycleType: string
  serialNumber?: string
  observations?: string
}

interface AuthResponse {
  success: boolean
  message: string
  data: {
    user: User
    token: string
  }
}

interface ProfileResponse {
  success: boolean
  data: {
    user: User
  }
}

interface BicyclesResponse {
  success: boolean
  data: Bicycle[]
}

interface BicycleResponse {
  success: boolean
  message: string
  data: Bicycle
}

interface MessageResponse {
  success: boolean
  message: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(result?.message || 'Ocurrió un error al comunicarse con el servidor')
  }

  return result as T
}

export async function login(email: string, password: string): Promise<User> {
  const result = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  saveToken(result.data.token)
  return result.data.user
}

export async function register(data: {
  fullName: string
  email: string
  password: string
  phone?: string
}): Promise<User> {
  const result = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  saveToken(result.data.token)
  return result.data.user
}

export async function getProfile(): Promise<User> {
  const result = await request<ProfileResponse>('/auth/me')
  return result.data.user
}

// Listar bicicletas del usuario autenticado.
export async function getBicycles(): Promise<Bicycle[]> {
  const result = await request<BicyclesResponse>('/bicycles')
  return result.data
}

// Registrar una bicicleta.
export async function createBicycle(data: BicycleInput): Promise<Bicycle> {
  const result = await request<BicycleResponse>('/bicycles', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  return result.data
}

// Actualizar una bicicleta.
export async function updateBicycle(
  id: string,
  data: BicycleInput,
): Promise<Bicycle> {
  const result = await request<BicycleResponse>(`/bicycles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

  return result.data
}

// Eliminar una bicicleta.
export async function deleteBicycle(id: string): Promise<string> {
  const result = await request<MessageResponse>(`/bicycles/${id}`, {
    method: 'DELETE',
  })

  return result.message
}

export interface Service {
  id: string
  name: string
  description: string | null
  reference_price: number
  duration_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface ServicesResponse {
  success: boolean
  data: Service[]
}

// Consultar el catálogo público de servicios activos.
export async function getServices(): Promise<Service[]> {
  const result = await request<ServicesResponse>('/services')
  return result.data
}

export interface AvailableMechanic {
  id: string
  name: string
}

export interface AvailabilitySlot {
  startsAt: string
  endsAt: string
  availableMechanics: AvailableMechanic[]
}

interface AvailabilityResponse {
  success: boolean
  data: {
    date: string
    service: {
      id: string
      name: string
      durationMinutes: number
    }
    availableSlots: AvailabilitySlot[]
  }
}

export interface AppointmentInput {
  bicycleId: string
  serviceId: string
  mechanicId: string
  startsAt: string
}

export interface Appointment {
  id: string
  client_id: string
  bicycle_id: string
  service_id: string
  mechanic_id: string
  starts_at: string
  ends_at: string
  service_name_snapshot: string
  duration_minutes_snapshot: number
  price_snapshot: number
  status: string
  created_at: string
  repair_order_id: string | null
  repair_status: string | null
}

interface AppointmentResponse {
  success: boolean
  message: string
  data: Appointment
}

// Consultar horarios y mecánicos disponibles para un servicio y fecha.
export async function getAvailability(
  date: string,
  serviceId: string,
): Promise<AvailabilitySlot[]> {
  const params = new URLSearchParams({ date, serviceId })
  const result = await request<AvailabilityResponse>(
    `/appointments/availability?${params.toString()}`,
  )

  return result.data.availableSlots
}

// Confirmar una reserva.
export async function createAppointment(
  data: AppointmentInput,
): Promise<Appointment> {
  const result = await request<AppointmentResponse>('/appointments', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  return result.data
}

interface MyAppointmentsResponse {
  success: boolean
  data: Appointment[]
}

// Consultar los turnos del cliente autenticado.
export async function getMyAppointments(): Promise<Appointment[]> {
  const result = await request<MyAppointmentsResponse>('/appointments/mine')
  return result.data
}

export interface EstimateItem {
  id: string
  estimate_id: string
  description: string
  quantity: number | string
  unit_price: number | string
  subtotal: number | string
}

export interface Estimate {
  id: string
  repair_order_id: string
  version: number
  status: string
  total: number | string
  created_at: string
  items: EstimateItem[]
}

interface EstimatesResponse {
  success: boolean
  data: Estimate[]
}

interface EstimateResponse {
  success: boolean
  message: string
  data: Estimate
}

// Consultar los presupuestos de una orden.
export async function getEstimates(orderId: string): Promise<Estimate[]> {
  const result = await request<EstimatesResponse>(
    `/repair-orders/${orderId}/estimates`,
  )
  return result.data
}

// Crear un presupuesto o una nueva versión.
export async function createEstimate(
  orderId: string,
  items: { description: string; quantity: number; unitPrice: number }[],
): Promise<Estimate> {
  const result = await request<EstimateResponse>(
    `/repair-orders/${orderId}/estimates`,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    },
  )
  return result.data
}

// Aprobar o rechazar un presupuesto.
export async function respondToEstimate(
  orderId: string,
  estimateId: string,
  decision: 'APPROVED' | 'REJECTED',
): Promise<void> {
  await request(
    `/repair-orders/${orderId}/estimates/${estimateId}/respond`,
    {
      method: 'PATCH',
      body: JSON.stringify({ decision }),
    },
  )
}

export interface MechanicAppointment {
  id: string
  client_id: string
  client_name: string
  bicycle_id: string
  bicycle_brand: string
  bicycle_model: string
  bicycle_type: string
  service_id: string
  service_name: string
  duration_minutes_snapshot: number
  price_snapshot: number
  starts_at: string
  ends_at: string
  appointment_status: string
  repair_order_id: string | null
  repair_status: string
}

interface MechanicAppointmentsResponse {
  success: boolean
  data: MechanicAppointment[]
}

interface RepairOrderResponse {
  success: boolean
  message: string
  data: {
    id: string
    appointment_id: string
    status: string
    received_at: string
  }
}

// Consultar la agenda del mecánico autenticado.
export async function getMechanicAppointments(): Promise<MechanicAppointment[]> {
  const result = await request<MechanicAppointmentsResponse>(
    '/appointments/mechanic/mine',
  )
  return result.data
}

// Registrar la recepción de una bicicleta y crear su orden de reparación.
export async function receiveAppointment(
  id: string,
  data: { visibleCondition: string; accessoriesReceived?: string },
): Promise<RepairOrderResponse['data']> {
  const result = await request<RepairOrderResponse>(
    `/appointments/${id}/receive`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
  return result.data
}

export interface RepairDiagnosis {
  id: string
  repair_order_id: string
  mechanic_id: string
  description: string
  recommended_tasks: string | null
  created_at: string
}

interface RepairDiagnosisResponse {
  success: boolean
  message: string
  data: RepairDiagnosis
}

interface RepairStatusResponse {
  success: boolean
  message: string
  data: {
    id: string
    status: string
    updated_at: string
  }
}

// Registrar el diagnóstico de una orden de reparación.
export async function createRepairDiagnosis(
  id: string,
  data: { description: string; recommendedTasks?: string },
): Promise<RepairDiagnosis> {
  const result = await request<RepairDiagnosisResponse>(
    `/repair-orders/${id}/diagnoses`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
  return result.data
}

// Actualizar el estado de una orden de reparación.
export async function updateRepairStatus(
  id: string,
  data: { status: string; notes?: string },
): Promise<RepairStatusResponse['data']> {
  const result = await request<RepairStatusResponse>(
    `/repair-orders/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  )
  return result.data
}
