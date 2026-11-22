import { useEffect, useState } from 'react'
import {
  getAvailability,
  getBicycles,
  getServices,
  createAppointment,
} from '../services/api'
import type {
  Appointment,
  AvailabilitySlot,
  Bicycle,
  Service,
} from '../services/api'

function getLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AppointmentBooking() {
  const today = getLocalDate(new Date())
  const lastDate = getLocalDate(
    new Date(new Date().setDate(new Date().getDate() + 30)),
  )

  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [bicycleId, setBicycleId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(today)
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [mechanicId, setMechanicId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createdAppointment, setCreatedAppointment] =
    useState<Appointment | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError('')
        const [bicyclesData, servicesData] = await Promise.all([
          getBicycles(),
          getServices(),
        ])

        setBicycles(bicyclesData)
        setServices(servicesData.filter((service) => service.is_active))

        if (bicyclesData.length > 0) {
          setBicycleId(bicyclesData[0].id)
        }

        if (servicesData.length > 0) {
          const activeServices = servicesData.filter(
            (service) => service.is_active,
          )
          if (activeServices.length > 0) {
            setServiceId(activeServices[0].id)
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los datos para reservar.',
        )
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  useEffect(() => {
    if (!serviceId || !date) {
      return
    }

    let cancelled = false

    async function loadAvailability() {
      try {
        setLoadingAvailability(true)
        setError('')
        setSelectedSlot(null)
        setMechanicId('')
        setSlots([])

        const result = await getAvailability(date, serviceId)

        if (!cancelled) {
          setSlots(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudo consultar la disponibilidad.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingAvailability(false)
        }
      }
    }

    void loadAvailability()

    return () => {
      cancelled = true
    }
  }, [date, serviceId])

  function handleSlotChange(value: string) {
    const slot = slots.find((item) => item.startsAt === value) ?? null
    setSelectedSlot(slot)
    setMechanicId('')
    setMessage('')
    setCreatedAppointment(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setCreatedAppointment(null)

    if (!bicycleId || !serviceId || !selectedSlot || !mechanicId) {
      setError('Completá todos los datos de la reserva.')
      return
    }

    try {
      setSubmitting(true)

      const appointment = await createAppointment({
        bicycleId,
        serviceId,
        mechanicId,
        startsAt: selectedSlot.startsAt,
      })

      setCreatedAppointment(appointment)
      setMessage('¡Tu turno fue reservado correctamente!')
      setSelectedSlot(null)
      setMechanicId('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo realizar la reserva.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <section className="appointment-section">
        <p className="feedback-message">Cargando opciones de reserva...</p>
      </section>
    )
  }

  return (
    <section className="appointment-section">
      <div className="appointment-heading">
        <h2>Reservar un turno</h2>
        <p>Elegí tu bicicleta, el servicio y un horario disponible.</p>
      </div>

      {error && <p className="feedback-message feedback-error">{error}</p>}
      {message && <p className="feedback-message">{message}</p>}

      {bicycles.length === 0 ? (
        <p className="feedback-message">
          Primero tenés que registrar una bicicleta para poder reservar.
        </p>
      ) : services.length === 0 ? (
        <p className="feedback-message">
          En este momento no hay servicios disponibles para reservar.
        </p>
      ) : (
        <form className="appointment-form" onSubmit={handleSubmit}>
          <label htmlFor="appointment-bicycle">Mi bicicleta</label>
          <select
            id="appointment-bicycle"
            value={bicycleId}
            onChange={(event) => setBicycleId(event.target.value)}
            required
          >
            <option value="">Seleccioná una bicicleta</option>
            {bicycles.map((bicycle) => (
              <option key={bicycle.id} value={bicycle.id}>
                {bicycle.brand} {bicycle.model}
              </option>
            ))}
          </select>

          <label htmlFor="appointment-service">Servicio</label>
          <select
            id="appointment-service"
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value)
              setMessage('')
              setCreatedAppointment(null)
            }}
            required
          >
            <option value="">Seleccioná un servicio</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} - ${service.reference_price.toLocaleString('es-AR')}
              </option>
            ))}
          </select>

          <label htmlFor="appointment-date">Fecha</label>
          <input
            id="appointment-date"
            type="date"
            value={date}
            min={today}
            max={lastDate}
            onChange={(event) => {
              setDate(event.target.value)
              setMessage('')
              setCreatedAppointment(null)
            }}
            required
          />

          <div className="appointment-availability">
            <h3>Horarios disponibles</h3>

            {loadingAvailability ? (
              <p className="feedback-message">Consultando disponibilidad...</p>
            ) : slots.length === 0 ? (
              <p className="feedback-message">
                No hay horarios disponibles para esa fecha y servicio. Probá
                con otro día.
              </p>
            ) : (
              <div className="appointment-slots">
                {slots.map((slot) => (
                  <label
                    className={`appointment-slot ${
                      selectedSlot?.startsAt === slot.startsAt
                        ? 'appointment-slot-selected'
                        : ''
                    }`}
                    key={slot.startsAt}
                  >
                    <input
                      type="radio"
                      name="appointment-slot"
                      value={slot.startsAt}
                      checked={selectedSlot?.startsAt === slot.startsAt}
                      onChange={(event) => handleSlotChange(event.target.value)}
                    />
                    <span>{formatDateTime(slot.startsAt)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {selectedSlot && (
            <div className="appointment-mechanics">
              <label htmlFor="appointment-mechanic">Mecánico</label>
              <select
                id="appointment-mechanic"
                value={mechanicId}
                onChange={(event) => setMechanicId(event.target.value)}
                required
              >
                <option value="">Seleccioná un mecánico</option>
                {selectedSlot.availableMechanics.map((mechanic) => (
                  <option key={mechanic.id} value={mechanic.id}>
                    {mechanic.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              loadingAvailability ||
              !selectedSlot ||
              !mechanicId
            }
          >
            {submitting ? 'Reservando...' : 'Confirmar reserva'}
          </button>
        </form>
      )}

      {createdAppointment && (
        <div className="appointment-confirmation">
          <h3>Detalle de tu turno</h3>
          <p>
            <strong>Servicio:</strong>{' '}
            {createdAppointment.service_name_snapshot}
          </p>
          <p>
            <strong>Fecha:</strong>{' '}
            {formatDateTime(createdAppointment.starts_at)}
          </p>
          <p>
            <strong>Duración:</strong>{' '}
            {createdAppointment.duration_minutes_snapshot} minutos
          </p>
          <p>
            <strong>Precio de referencia:</strong> $
            {createdAppointment.price_snapshot.toLocaleString('es-AR')}
          </p>
          <p>
            <strong>Estado:</strong> {createdAppointment.status}
          </p>
        </div>
      )}
    </section>
  )
}


