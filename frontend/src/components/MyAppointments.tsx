import { useEffect, useState } from 'react'
import {
  getMyAppointments,
  getEstimates,
  respondToEstimate,
} from '../services/api'
import type { Appointment, Estimate } from '../services/api'

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente de respuesta',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
}

export default function MyAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [estimateMap, setEstimateMap] = useState<Record<string, Estimate[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    async function loadAppointments() {
      try {
        const data = await getMyAppointments()
        const orders = data.filter((item) => item.repair_order_id)
        const results = await Promise.all(
          orders.map(async (item) => ({
            id: item.repair_order_id!,
            estimates: await getEstimates(item.repair_order_id!),
          })),
        )

        if (active) {
          setAppointments(data)
          setEstimateMap(Object.fromEntries(
            results.map((item) => [item.id, item.estimates]),
          ))
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los turnos')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadAppointments()
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

  async function handleEstimateResponse(
    orderId: string,
    estimateId: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await respondToEstimate(orderId, estimateId, decision)
      setEstimateMap((current) => ({
        ...current,
        [orderId]: (current[orderId] ?? []).map((estimate) =>
          estimate.id === estimateId
            ? { ...estimate, status: decision }
            : estimate,
        ),
      }))
      if (decision === 'APPROVED') {
        setAppointments((current) =>
          current.map((appointment) =>
            appointment.repair_order_id === orderId
              ? { ...appointment, repair_status: 'APPROVED' }
              : appointment,
          ),
        )
      }
      setMessage(
        decision === 'APPROVED'
          ? 'Presupuesto aprobado correctamente.'
          : 'Presupuesto rechazado. El mecánico podrá preparar una nueva versión.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo responder el presupuesto')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <section className="my-appointments"><p>Cargando tus turnos...</p></section>
  }

  return (
    <section className="my-appointments">
      <h2>Mis turnos</h2>

      {error && <p className="error-message">{error}</p>}
      {message && <p className="success-message">{message}</p>}

      {!error && appointments.length === 0 && (
        <p>Todavía no tenés turnos reservados.</p>
      )}

      <div className="appointments-list">
        {appointments.map((appointment) => {
          const estimates = appointment.repair_order_id
            ? estimateMap[appointment.repair_order_id] ?? []
            : []

          return (
            <article className="appointment-card" key={appointment.id}>
              <div className="appointment-card-header">
                <h3>{appointment.service_name_snapshot}</h3>
                <span className={`appointment-status status-${appointment.status.toLowerCase()}`}>
                  {appointment.status === 'CONFIRMED' ? 'Confirmado' : appointment.status}
                </span>
              </div>

              <p><strong>Fecha:</strong> {formatDate(appointment.starts_at)}</p>
              <p><strong>Duración:</strong> {appointment.duration_minutes_snapshot} minutos</p>
              <p><strong>Precio del servicio:</strong> {formatPrice(Number(appointment.price_snapshot))}</p>

              {appointment.repair_status && (
                <p><strong>Estado de reparación:</strong> {appointment.repair_status}</p>
              )}

              {estimates.length > 0 && (
                <div className="client-estimates">
                  <h4>Presupuestos de reparación</h4>
                  {estimates.map((estimate) => (
                    <div className="mechanic-reception-form" key={estimate.id}>
                      <h5>
                        Presupuesto versión {estimate.version}
                        {' · '}
                        {statusLabels[estimate.status] ?? estimate.status}
                      </h5>
                      {estimate.items.map((item) => (
                        <p key={item.id}>
                          {item.description} — {Number(item.quantity)} × {formatPrice(Number(item.unit_price))}
                          {' = '}
                          {formatPrice(Number(item.subtotal))}
                        </p>
                      ))}
                      <p><strong>Total: {formatPrice(Number(estimate.total))}</strong></p>

                      {estimate.status === 'PENDING' && (
                        <div className="mechanic-form-actions">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleEstimateResponse(
                              estimate.repair_order_id,
                              estimate.id,
                              'APPROVED',
                            )}
                          >
                            Aprobar presupuesto
                          </button>
                          <button
                            type="button"
                            className="mechanic-cancel"
                            disabled={saving}
                            onClick={() => void handleEstimateResponse(
                              estimate.repair_order_id,
                              estimate.id,
                              'REJECTED',
                            )}
                          >
                            Rechazar presupuesto
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}