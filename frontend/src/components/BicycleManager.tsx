
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getBicycles,
  createBicycle,
  updateBicycle,
  deleteBicycle,
  type Bicycle,
  type BicycleInput,
} from '../services/api'

const emptyForm: BicycleInput = {
  brand: '',
  model: '',
  bicycleType: '',
  serialNumber: '',
  observations: '',
}

function BicycleManager() {
  const [bicycles, setBicycles] = useState<Bicycle[]>([])
  const [form, setForm] = useState<BicycleInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadBicycles = useCallback(async () => {
    try {
      const data = await getBicycles()
      setBicycles(data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudieron cargar las bicicletas.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
  let cancelled = false

  getBicycles()
    .then((data) => {
      if (!cancelled) {
        setBicycles(data)
      }
    })
    .catch((err: unknown) => {
      if (!cancelled) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las bicicletas.',
        )
      }
    })
    .finally(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

  return () => {
    cancelled = true
  }
}, [])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
  }

  function handleChange(
    field: keyof BicycleInput,
    value: string,
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      const data: BicycleInput = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        bicycleType: form.bicycleType.trim(),
        serialNumber: form.serialNumber?.trim() || '',
        observations: form.observations?.trim() || '',
      }

      if (editingId) {
        await updateBicycle(editingId, data)
        setSuccess('Bicicleta actualizada correctamente.')
      } else {
        await createBicycle(data)
        setSuccess('Bicicleta registrada correctamente.')
      }

      resetForm()
      await loadBicycles()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo guardar la bicicleta.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing(bicycle: Bicycle) {
    setEditingId(bicycle.id)
    setForm({
      brand: bicycle.brand,
      model: bicycle.model,
      bicycleType: bicycle.bicycle_type,
      serialNumber: bicycle.serial_number || '',
      observations: bicycle.observations || '',
    })
    setError('')
    setSuccess('')
  }

  async function handleDelete(bicycle: Bicycle) {
    const confirmed = window.confirm(
      `¿Estás seguro de que querés eliminar la bicicleta ${bicycle.brand} ${bicycle.model}?`,
    )

    if (!confirmed) return

    setError('')
    setSuccess('')

    try {
      const message = await deleteBicycle(bicycle.id)
      setSuccess(message)
      await loadBicycles()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar la bicicleta.',
      )
    }
  }

  return (
    <section className="bicycle-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TU GARAJE</span>
          <h2>Mis bicicletas</h2>
          <p>Administrá las bicicletas que tenés registradas en el taller.</p>
        </div>
        <span className="bicycle-count">
          {bicycles.length} {bicycles.length === 1 ? 'bicicleta' : 'bicicletas'}
        </span>
      </div>

      {error && <div className="message error">{error}</div>}
      {success && <div className="message success">{success}</div>}

      <div className="bicycle-content">
        <div className="bicycle-list">
          {loading ? (
            <p className="empty-state">Cargando tus bicicletas...</p>
          ) : bicycles.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🚲</span>
              <h3>Todavía no registraste bicicletas</h3>
              <p>Agregá tu primera bicicleta para comenzar.</p>
            </div>
          ) : (
            bicycles.map((bicycle) => (
              <article className="bicycle-card" key={bicycle.id}>
                <div className="bicycle-icon">🚲</div>
                <div className="bicycle-info">
                  <h3>{bicycle.brand} {bicycle.model}</h3>
                  <p>{bicycle.bicycle_type}</p>
                  {bicycle.serial_number && (
                    <span>N.º de serie: {bicycle.serial_number}</span>
                  )}
                  {bicycle.observations && (
                    <span>{bicycle.observations}</span>
                  )}
                </div>
                <div className="bicycle-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => startEditing(bicycle)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleDelete(bicycle)}
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="bicycle-form-card">
          <h3>{editingId ? 'Editar bicicleta' : 'Agregar bicicleta'}</h3>
          <p>
            {editingId
              ? 'Modificá los datos de tu bicicleta.'
              : 'Completá los datos para registrar una bicicleta.'}
          </p>

          <form className="bicycle-form" onSubmit={handleSubmit}>
            <label>
              Marca
              <input
                value={form.brand}
                onChange={(event) => handleChange('brand', event.target.value)}
                placeholder="Ej. Trek"
                maxLength={100}
                required
              />
            </label>

            <label>
              Modelo
              <input
                value={form.model}
                onChange={(event) => handleChange('model', event.target.value)}
                placeholder="Ej. Marlin 5"
                maxLength={100}
                required
              />
            </label>

            <label>
              Tipo de bicicleta
              <input
                value={form.bicycleType}
                onChange={(event) => handleChange('bicycleType', event.target.value)}
                placeholder="Ej. Montaña, ruta, urbana..."
                maxLength={60}
                required
              />
            </label>

            <label>
              Número de serie <span className="optional">(opcional)</span>
              <input
                value={form.serialNumber || ''}
                onChange={(event) => handleChange('serialNumber', event.target.value)}
                placeholder="Número de serie"
                maxLength={120}
              />
            </label>

            <label>
              Observaciones <span className="optional">(opcional)</span>
              <textarea
                value={form.observations || ''}
                onChange={(event) => handleChange('observations', event.target.value)}
                placeholder="Detalles adicionales..."
                rows={3}
              />
            </label>

            <button
              className="submit-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? 'Guardando...'
                : editingId
                  ? 'Guardar cambios'
                  : 'Registrar bicicleta'}
            </button>

            {editingId && (
              <button
                className="cancel-button"
                type="button"
                onClick={resetForm}
              >
                Cancelar edición
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}

export default BicycleManager
