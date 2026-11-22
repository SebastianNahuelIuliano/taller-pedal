import { useEffect, useState } from 'react'
import {
  getMechanicAppointments,
  receiveAppointment,
  createRepairDiagnosis,
  updateRepairStatus,
  type MechanicAppointment,
} from '../services/api'

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function availableTransitions(status: string): string[] {
  const transitions: Record<string, string[]> = {
    APPROVED: ['IN_PROGRESS'],
    IN_PROGRESS: ['WAITING_PARTS', 'READY'],
    WAITING_PARTS: ['IN_PROGRESS'],
    READY: ['DELIVERED'],
  }
  return transitions[status] ?? []
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    NOT_RECEIVED: 'Pendiente de recepción',
    RECEIVED: 'Recibida',
    DIAGNOSIS: 'En diagnóstico',
    WAITING_APPROVAL: 'Esperando aprobación',
    APPROVED: 'Presupuesto aprobado',
    IN_PROGRESS: 'En reparación',
    WAITING_PARTS: 'Esperando repuestos',
    READY: 'Lista para entregar',
    DELIVERED: 'Entregada',
    CANCELLED: 'Cancelada',
  }
  return labels[status] ?? status
}

function MechanicDashboard() {
  const [appointments, setAppointments] = useState<MechanicAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visibleCondition, setVisibleCondition] = useState('')
  const [accessoriesReceived, setAccessoriesReceived] = useState('')
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null)
  const [diagnosisDescription, setDiagnosisDescription] = useState('')
  const [recommendedTasks, setRecommendedTasks] = useState('')
  const [statusId, setStatusId] = useState<string | null>(null)
  const [nextStatus, setNextStatus] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadAppointments() {
    setLoading(true)
    setError('')
    try {
      const data = await getMechanicAppointments()
      setAppointments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la agenda')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    getMechanicAppointments()
      .then((data) => {
        if (!cancelled) setAppointments(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la agenda')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleReceive(id: string) {
    if (!visibleCondition.trim()) {
      setError('Describí el estado visible de la bicicleta antes de recibirla.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const order = await receiveAppointment(id, {
        visibleCondition: visibleCondition.trim(),
        accessoriesReceived: accessoriesReceived.trim(),
      })

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === id
            ? {
                ...appointment,
                repair_order_id: order.id,
                repair_status: order.status,
              }
            : appointment,
        ),
      )
      setSelectedId(null)
      setVisibleCondition('')
      setAccessoriesReceived('')
      setMessage('Bicicleta recibida correctamente. Se creó la orden de reparación.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recibir la bicicleta')
    } finally {
      setSaving(false)
    }
  }

  async function handleDiagnosis(id: string) {
    if (!diagnosisDescription.trim()) {
      setError('La descripción del diagnóstico es obligatoria.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      await createRepairDiagnosis(id, {
        description: diagnosisDescription.trim(),
        recommendedTasks: recommendedTasks.trim(),
      })

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.repair_order_id === id
            ? { ...appointment, repair_status: 'DIAGNOSIS' }
            : appointment,
        ),
      )
      setDiagnosisId(null)
      setDiagnosisDescription('')
      setRecommendedTasks('')
      setMessage('Diagnóstico registrado correctamente.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el diagnóstico')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(id: string) {
    if (!nextStatus) {
      setError('Seleccioná el nuevo estado de la reparación.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await updateRepairStatus(id, {
        status: nextStatus,
        notes: statusNotes.trim(),
      })

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.repair_order_id === id
            ? { ...appointment, repair_status: result.status }
            : appointment,
        ),
      )
      setStatusId(null)
      setNextStatus('')
      setStatusNotes('')
      setMessage(`Estado actualizado: ${statusLabel(result.status)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <section className="mechanic-section"><p>Cargando agenda...</p></section>
  }

  return (
    <section className="mechanic-section">
      <div className="mechanic-heading">
        <div>
          <h2>Mi agenda</h2>
          <p>Consultá tus turnos, recibí bicicletas y gestioná las reparaciones.</p>
        </div>
        <button type="button" className="mechanic-refresh" onClick={() => void loadAppointments()}>
          Actualizar
        </button>
      </div>

      {error && <p className="mechanic-feedback mechanic-error">{error}</p>}
      {message && <p className="mechanic-feedback mechanic-success">{message}</p>}

      {!appointments.length ? (
        <div className="mechanic-empty">
          <p>No tenés turnos asignados por el momento.</p>
        </div>
      ) : (
        <div className="mechanic-appointments">
          {appointments.map((appointment) => {
            const transitions = availableTransitions(appointment.repair_status)

            return (
              <article className="mechanic-appointment-card" key={appointment.id}>
                <div className="mechanic-card-top">
                  <div>
                    <h3>{appointment.client_name}</h3>
                    <p className="mechanic-date">
                      {formatDate(appointment.starts_at)} · {formatTime(appointment.starts_at)} a {formatTime(appointment.ends_at)}
                    </p>
                  </div>
                  <span className="mechanic-status">{appointment.appointment_status}</span>
                </div>

                <div className="mechanic-details">
                  <p><strong>Bicicleta:</strong> {appointment.bicycle_brand} {appointment.bicycle_model}</p>
                  <p><strong>Tipo:</strong> {appointment.bicycle_type}</p>
                  <p><strong>Servicio:</strong> {appointment.service_name}</p>
                  <p><strong>Duración:</strong> {appointment.duration_minutes_snapshot} minutos</p>
                  <p><strong>Estado de reparación:</strong> {statusLabel(appointment.repair_status)}</p>
                </div>

                {!appointment.repair_order_id && appointment.appointment_status === 'CONFIRMED' && (
                  <div className="mechanic-reception">
                    {selectedId === appointment.id ? (
                      <div className="mechanic-reception-form">
                        <h4>Registrar recepción</h4>
                        <label htmlFor={`condition-${appointment.id}`}>Estado visible de la bicicleta *</label>
                        <textarea
                          id={`condition-${appointment.id}`}
                          rows={3}
                          maxLength={5000}
                          value={visibleCondition}
                          onChange={(event) => setVisibleCondition(event.target.value)}
                          placeholder="Describí el estado general, daños visibles y observaciones..."
                        />
                        <label htmlFor={`accessories-${appointment.id}`}>Accesorios recibidos</label>
                        <textarea
                          id={`accessories-${appointment.id}`}
                          rows={2}
                          maxLength={2000}
                          value={accessoriesReceived}
                          onChange={(event) => setAccessoriesReceived(event.target.value)}
                          placeholder="Ej.: luces, casco, candado (opcional)"
                        />
                        <div className="mechanic-form-actions">
                          <button type="button" disabled={saving} onClick={() => void handleReceive(appointment.id)}>
                            {saving ? 'Registrando...' : 'Confirmar recepción'}
                          </button>
                          <button
                            type="button"
                            className="mechanic-cancel"
                            disabled={saving}
                            onClick={() => {
                              setSelectedId(null)
                              setVisibleCondition('')
                              setAccessoriesReceived('')
                              setError('')
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(appointment.id)
                          setError('')
                          setMessage('')
                        }}
                      >
                        Recibir bicicleta
                      </button>
                    )}
                  </div>
                )}

                {appointment.repair_order_id && (
                  <div className="mechanic-repair-actions">
                    <p className="mechanic-received">
                      Orden de reparación: {appointment.repair_order_id}
                    </p>

                    {(appointment.repair_status === 'RECEIVED' || appointment.repair_status === 'DIAGNOSIS') && (
                      <div className="mechanic-reception-form">
                        {diagnosisId === appointment.repair_order_id ? (
                          <>
                            <h4>Registrar diagnóstico</h4>
                            <label htmlFor={`diagnosis-${appointment.id}`}>Descripción del diagnóstico *</label>
                            <textarea
                              id={`diagnosis-${appointment.id}`}
                              rows={4}
                              maxLength={5000}
                              value={diagnosisDescription}
                              onChange={(event) => setDiagnosisDescription(event.target.value)}
                              placeholder="Describí los problemas detectados..."
                            />
                            <label htmlFor={`tasks-${appointment.id}`}>Tareas recomendadas</label>
                            <textarea
                              id={`tasks-${appointment.id}`}
                              rows={3}
                              maxLength={5000}
                              value={recommendedTasks}
                              onChange={(event) => setRecommendedTasks(event.target.value)}
                              placeholder="Detallá las reparaciones o tareas sugeridas (opcional)..."
                            />
                            <div className="mechanic-form-actions">
                              <button type="button" disabled={saving} onClick={() => void handleDiagnosis(appointment.repair_order_id!)}>
                                {saving ? 'Guardando...' : 'Guardar diagnóstico'}
                              </button>
                              <button
                                type="button"
                                className="mechanic-cancel"
                                disabled={saving}
                                onClick={() => {
                                  setDiagnosisId(null)
                                  setDiagnosisDescription('')
                                  setRecommendedTasks('')
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDiagnosisId(appointment.repair_order_id)
                              setError('')
                              setMessage('')
                            }}
                          >
                            Registrar diagnóstico
                          </button>
                        )}
                      </div>
                    )}

                    {transitions.length > 0 && (
                      <div className="mechanic-reception-form">
                        {statusId === appointment.repair_order_id ? (
                          <>
                            <h4>Actualizar estado de reparación</h4>
                            <label htmlFor={`status-${appointment.id}`}>Nuevo estado</label>
                            <select
                              id={`status-${appointment.id}`}
                              value={nextStatus}
                              onChange={(event) => setNextStatus(event.target.value)}
                            >
                              <option value="">Seleccionar estado...</option>
                              {transitions.map((status) => (
                                <option key={status} value={status}>{statusLabel(status)}</option>
                              ))}
                            </select>
                            <label htmlFor={`notes-${appointment.id}`}>Comentario (opcional)</label>
                            <textarea
                              id={`notes-${appointment.id}`}
                              rows={2}
                              maxLength={2000}
                              value={statusNotes}
                              onChange={(event) => setStatusNotes(event.target.value)}
                              placeholder="Agregá una observación sobre el cambio..."
                            />
                            <div className="mechanic-form-actions">
                              <button type="button" disabled={saving || !nextStatus} onClick={() => void handleStatusChange(appointment.repair_order_id!)}>
                                {saving ? 'Actualizando...' : 'Confirmar estado'}
                              </button>
                              <button
                                type="button"
                                className="mechanic-cancel"
                                disabled={saving}
                                onClick={() => {
                                  setStatusId(null)
                                  setNextStatus('')
                                  setStatusNotes('')
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusId(appointment.repair_order_id)
                              setNextStatus('')
                              setError('')
                              setMessage('')
                            }}
                          >
                            Actualizar estado
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default MechanicDashboard

