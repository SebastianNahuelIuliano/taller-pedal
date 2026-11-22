import { useEffect, useState } from 'react'
import { getMyAppointments } from '../services/api'
import type { Appointment } from '../services/api'

export default function MyAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadAppointments() {
      try {
        const data = await getMyAppointments()
        if (active) setAppointments(data)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los turnos')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAppointments()

    return () => {
      active = false
    }
  }, [])

  function formatDate(value: string): string {
    return new Date(value).toLocaleString('es-AR', {
      dateStyle: 'long',
      timeStyle: 'short',
    })
  }

  function formatPrice(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(value)
  }

  if (loading) {
    return <section className="my-appointments"><p>Cargando tus turnos...</p></section>
  }

  return (
    <section className="my-appointments">
      <h2>Mis turnos</h2>

      {error && <p className="error-message">{error}</p>}

      {!error && appointments.length === 0 && (
        <p>Todavía no tenés turnos reservados.</p>
      )}

      <div className="appointments-list">
        {appointments.map((appointment) => (
          <article className="appointment-card" key={appointment.id}>
            <div className="appointment-card-header">
              <h3>{appointment.service_name_snapshot}</h3>
              <span className={`appointment-status status-${appointment.status.toLowerCase()}`}>
                {appointment.status === 'CONFIRMED' ? 'Confirmado' : appointment.status}
              </span>
            </div>

            <p><strong>Fecha:</strong> {formatDate(appointment.starts_at)}</p>
            <p><strong>Duración:</strong> {appointment.duration_minutes_snapshot} minutos</p>
            <p><strong>Precio:</strong> {formatPrice(Number(appointment.price_snapshot))}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
