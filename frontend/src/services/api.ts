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

