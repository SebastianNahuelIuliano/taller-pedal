import { useEffect, useState } from 'react'
import { getServices, type Service } from '../services/api'

export default function ServiceCatalog() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    getServices()
      .then((data) => {
        if (!cancelled) setServices(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudo cargar el catálogo de servicios.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="service-section">
      <div className="section-heading">
        <div>
          <h2>Catálogo de servicios</h2>
          <p>Conocé los servicios disponibles para tu bicicleta.</p>
        </div>
      </div>

      {loading && <p className="feedback-message">Cargando servicios...</p>}

      {!loading && error && (
        <p className="feedback-error" role="alert">{error}</p>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="empty-state">
          <h3>No hay servicios disponibles</h3>
          <p>Por el momento no tenemos servicios publicados.</p>
        </div>
      )}

      {!loading && !error && services.length > 0 && (
        <div className="service-grid">
          {services.map((service) => (
            <article className="service-card" key={service.id}>
              <h3>{service.name}</h3>

              <p className="service-description">
                {service.description || 'Sin descripción disponible.'}
              </p>

              <div className="service-details">
                <span>
                  Precio de referencia:{' '}
                  <strong>
                    {Number(service.reference_price).toLocaleString('es-AR', {
                      style: 'currency',
                      currency: 'ARS',
                    })}
                  </strong>
                </span>

                <span>
                  Duración estimada:{' '}
                  <strong>{service.duration_minutes} minutos</strong>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
