import { useEffect, useState, type FormEvent } from 'react'
import {
  getAdminServices,
  createService,
  updateService,
  setServiceStatus,
  getAdminSpareParts,
  createSparePart,
  updateSparePart,
  setSparePartStatus,
  getAdminMechanics,
  createMechanic,
  getAdminAppointments,
  reassignAppointment,
  getWorkshopHours,
  updateWorkshopHours,
  getMechanicBlocks,
  createMechanicBlock,
  deleteMechanicBlock,
  type Service,
  type SparePart,
  type AdminMechanic,
  type AdminAppointment,
  type WorkshopHour,
  type MechanicBlock,
} from '../services/api'

type Tab = 'services' | 'parts' | 'mechanics' | 'appointments' | 'hours' | 'blocks'

const tabs: { id: Tab; label: string }[] = [
  { id: 'services', label: 'Servicios' },
  { id: 'parts', label: 'Repuestos' },
  { id: 'mechanics', label: 'Mecánicos' },
  { id: 'appointments', label: 'Turnos' },
  { id: 'hours', label: 'Horarios' },
  { id: 'blocks', label: 'Bloqueos' },
]

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('services')
  const [services, setServices] = useState<Service[]>([])
  const [parts, setParts] = useState<SparePart[]>([])
  const [mechanics, setMechanics] = useState<AdminMechanic[]>([])
  const [appointments, setAppointments] = useState<AdminAppointment[]>([])
  const [hours, setHours] = useState<WorkshopHour[]>([])
  const [blocks, setBlocks] = useState<MechanicBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [editingPart, setEditingPart] = useState<SparePart | null>(null)

  const [serviceForm, setServiceForm] = useState({
    name: '', description: '', referencePrice: '', durationMinutes: '60',
  })
  const [partForm, setPartForm] = useState({
    code: '', name: '', description: '', referencePrice: '',
    quantityAvailable: '0', minimumStock: '0',
  })
  const [mechanicForm, setMechanicForm] = useState({
    fullName: '', email: '', password: '', phone: '',
  })
  const [blockForm, setBlockForm] = useState({
    mechanicId: '', startsAt: '', endsAt: '', reason: '',
  })
  const [assignments, setAssignments] = useState<Record<string, string>>({})

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [s, p, m, a, h, b] = await Promise.all([
        getAdminServices(),
        getAdminSpareParts(),
        getAdminMechanics(),
        getAdminAppointments(),
        getWorkshopHours(),
        getMechanicBlocks(),
      ])
      setServices(s)
      setParts(p)
      setMechanics(m)
      setAppointments(a)
      setHours(h.sort((x, y) => x.day_of_week - y.day_of_week))
      setBlocks(b)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [])

  function notify(text: string) {
    setMessage(text)
    setError('')
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      notify(success)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.')
    } finally {
      setBusy(false)
    }
  }

  function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = {
      name: serviceForm.name.trim(),
      description: serviceForm.description.trim(),
      referencePrice: Number(serviceForm.referencePrice),
      durationMinutes: Number(serviceForm.durationMinutes),
    }
    const action = editingService
      ? () => updateService(editingService.id, data)
      : () => createService(data)
    void perform(action, editingService ? 'Servicio actualizado.' : 'Servicio creado.')
    setEditingService(null)
    setServiceForm({ name: '', description: '', referencePrice: '', durationMinutes: '60' })
  }

  function editService(service: Service) {
    setEditingService(service)
    setServiceForm({
      name: service.name,
      description: service.description || '',
      referencePrice: String(service.reference_price),
      durationMinutes: String(service.duration_minutes),
    })
  }

  function submitPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = {
      code: partForm.code.trim(),
      name: partForm.name.trim(),
      description: partForm.description.trim(),
      referencePrice: Number(partForm.referencePrice),
      quantityAvailable: Number(partForm.quantityAvailable),
      minimumStock: Number(partForm.minimumStock),
    }
    const action = editingPart
      ? () => updateSparePart(editingPart.id, data)
      : () => createSparePart(data)
    void perform(action, editingPart ? 'Repuesto actualizado.' : 'Repuesto creado.')
    setEditingPart(null)
    setPartForm({
      code: '', name: '', description: '', referencePrice: '',
      quantityAvailable: '0', minimumStock: '0',
    })
  }

  function editPart(part: SparePart) {
    setEditingPart(part)
    setPartForm({
      code: part.code,
      name: part.name,
      description: part.description || '',
      referencePrice: String(part.reference_price),
      quantityAvailable: String(part.quantity_available),
      minimumStock: String(part.minimum_stock),
    })
  }

  function submitMechanic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(
      () => createMechanic({
        fullName: mechanicForm.fullName.trim(),
        email: mechanicForm.email.trim(),
        password: mechanicForm.password,
        ...(mechanicForm.phone.trim() ? { phone: mechanicForm.phone.trim() } : {}),
      }),
      'Cuenta de mecánico creada.',
    )
    setMechanicForm({ fullName: '', email: '', password: '', phone: '' })
  }

  function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(
      () => createMechanicBlock({
        mechanicId: blockForm.mechanicId,
        startsAt: new Date(blockForm.startsAt).toISOString(),
        endsAt: new Date(blockForm.endsAt).toISOString(),
        reason: blockForm.reason.trim(),
      }),
      'Bloqueo creado.',
    )
    setBlockForm({ mechanicId: '', startsAt: '', endsAt: '', reason: '' })
  }

  function submitHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(
      () => updateWorkshopHours(hours.map((day) => ({
        dayOfWeek: day.day_of_week,
        opensAt: day.opens_at.slice(0, 5),
        closesAt: day.closes_at.slice(0, 5),
        isClosed: day.is_closed,
      }))),
      'Horarios actualizados.',
    )
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  return (
    <section className="admin-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">GESTIÓN DEL TALLER</span>
          <h2>Panel de administración</h2>
          <p>Administrá los servicios, el equipo y la agenda de Taller Pedal.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadData()}>
          Actualizar
        </button>
      </div>

      <nav className="admin-tabs" aria-label="Secciones administrativas">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <div className="message error">{error}</div>}
      {message && <div className="message success">{message}</div>}
      {loading ? <p>Cargando información...</p> : (
        <>
          {tab === 'services' && (
            <div className="admin-layout">
              <form className="admin-form" onSubmit={submitService}>
                <h3>{editingService ? 'Editar servicio' : 'Nuevo servicio'}</h3>
                <label>Nombre<input required maxLength={150} value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} /></label>
                <label>Descripción<textarea value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} /></label>
                <label>Precio de referencia<input required type="number" min="0" step="0.01" value={serviceForm.referencePrice} onChange={(e) => setServiceForm({ ...serviceForm, referencePrice: e.target.value })} /></label>
                <label>Duración (minutos)<input required type="number" min="1" step="1" value={serviceForm.durationMinutes} onChange={(e) => setServiceForm({ ...serviceForm, durationMinutes: e.target.value })} /></label>
                <button className="submit-button" disabled={busy}>Guardar servicio</button>
                {editingService && <button type="button" className="cancel-button" onClick={() => { setEditingService(null); setServiceForm({ name: '', description: '', referencePrice: '', durationMinutes: '60' }) }}>Cancelar edición</button>}
              </form>
              <div className="admin-list">
                <h3>Catálogo de servicios</h3>
                {services.map((service) => (
                  <article className="admin-item" key={service.id}>
                    <div>
                      <strong>{service.name}</strong>
                      <p>${Number(service.reference_price).toLocaleString('es-AR')} · {service.duration_minutes} min · {service.is_active ? 'Activo' : 'Inactivo'}</p>
                      {service.description && <small>{service.description}</small>}
                    </div>
                    <div className="admin-actions">
                      <button className="secondary-button" onClick={() => editService(service)}>Editar</button>
                      <button className="secondary-button" disabled={busy} onClick={() => void perform(() => setServiceStatus(service.id, !service.is_active), 'Estado del servicio actualizado.')}>{service.is_active ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </article>
                ))}
                {services.length === 0 && <p>No hay servicios registrados.</p>}
              </div>
            </div>
          )}

          {tab === 'parts' && (
            <div className="admin-layout">
              <form className="admin-form" onSubmit={submitPart}>
                <h3>{editingPart ? 'Editar repuesto' : 'Nuevo repuesto'}</h3>
                <label>Código<input required maxLength={80} value={partForm.code} onChange={(e) => setPartForm({ ...partForm, code: e.target.value })} /></label>
                <label>Nombre<input required maxLength={150} value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })} /></label>
                <label>Descripción<textarea value={partForm.description} onChange={(e) => setPartForm({ ...partForm, description: e.target.value })} /></label>
                <label>Precio<input required type="number" min="0" step="0.01" value={partForm.referencePrice} onChange={(e) => setPartForm({ ...partForm, referencePrice: e.target.value })} /></label>
                <label>Stock disponible<input required type="number" min="0" step="1" value={partForm.quantityAvailable} onChange={(e) => setPartForm({ ...partForm, quantityAvailable: e.target.value })} /></label>
                <label>Stock mínimo<input required type="number" min="0" step="1" value={partForm.minimumStock} onChange={(e) => setPartForm({ ...partForm, minimumStock: e.target.value })} /></label>
                <button className="submit-button" disabled={busy}>Guardar repuesto</button>
                {editingPart && <button type="button" className="cancel-button" onClick={() => { setEditingPart(null); setPartForm({ code: '', name: '', description: '', referencePrice: '', quantityAvailable: '0', minimumStock: '0' }) }}>Cancelar edición</button>}
              </form>
              <div className="admin-list">
                <h3>Inventario</h3>
                {parts.map((part) => (
                  <article className="admin-item" key={part.id}>
                    <div>
                      <strong>{part.name} <small>({part.code})</small></strong>
                      <p>Stock: {part.quantity_available} · Mínimo: {part.minimum_stock} · ${Number(part.reference_price).toLocaleString('es-AR')}</p>
                      <small>{part.is_active ? 'Activo' : 'Inactivo'}{part.quantity_available <= part.minimum_stock ? ' · Stock bajo' : ''}</small>
                    </div>
                    <div className="admin-actions">
                      <button className="secondary-button" onClick={() => editPart(part)}>Editar</button>
                      <button className="secondary-button" disabled={busy} onClick={() => void perform(() => setSparePartStatus(part.id, !part.is_active), 'Estado del repuesto actualizado.')}>{part.is_active ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </article>
                ))}
                {parts.length === 0 && <p>No hay repuestos registrados.</p>}
              </div>
            </div>
          )}

          {tab === 'mechanics' && (
            <div className="admin-layout">
              <form className="admin-form" onSubmit={submitMechanic}>
                <h3>Crear cuenta de mecánico</h3>
                <label>Nombre completo<input required minLength={2} maxLength={150} value={mechanicForm.fullName} onChange={(e) => setMechanicForm({ ...mechanicForm, fullName: e.target.value })} /></label>
                <label>Correo electrónico<input required type="email" maxLength={255} value={mechanicForm.email} onChange={(e) => setMechanicForm({ ...mechanicForm, email: e.target.value })} /></label>
                <label>Contraseña<input required type="password" minLength={8} maxLength={128} value={mechanicForm.password} onChange={(e) => setMechanicForm({ ...mechanicForm, password: e.target.value })} /></label>
                <label>Teléfono<input maxLength={40} value={mechanicForm.phone} onChange={(e) => setMechanicForm({ ...mechanicForm, phone: e.target.value })} /></label>
                <button className="submit-button" disabled={busy}>Crear mecánico</button>
              </form>
              <div className="admin-list">
                <h3>Equipo de mecánicos</h3>
                {mechanics.map((mechanic) => (
                  <article className="admin-item" key={mechanic.id}>
                    <div>
                      <strong>{mechanic.full_name}</strong>
                      <p>{mechanic.email} · {mechanic.phone || 'Sin teléfono'}</p>
                      <small>{mechanic.is_active ? 'Activo' : 'Inactivo'}</small>
                    </div>
                  </article>
                ))}
                {mechanics.length === 0 && <p>No hay mecánicos registrados.</p>}
              </div>
            </div>
          )}

          {tab === 'appointments' && (
            <div className="admin-list">
              <h3>Turnos registrados</h3>
              {appointments.map((appointment) => (
                <article className="admin-item admin-item-column" key={appointment.id}>
                  <div>
                    <strong>{appointment.client_name} · {appointment.service_name_snapshot}</strong>
                    <p>{appointment.bicycle_brand} {appointment.bicycle_model} · {appointment.bicycle_type}</p>
                    <p>{formatDate(appointment.starts_at)} · Estado: {appointment.status}</p>
                    <small>Mecánico actual: {appointment.mechanic_name || 'Sin asignar'} · Reparación: {appointment.repair_status || 'Sin recibir'}</small>
                  </div>
                  {appointment.status === 'CONFIRMED' && !appointment.repair_order_id && (
                    <div className="admin-actions">
                      <select aria-label="Nuevo mecánico" value={assignments[appointment.id] || ''} onChange={(e) => setAssignments({ ...assignments, [appointment.id]: e.target.value })}>
                        <option value="">Seleccionar mecánico</option>
                        {mechanics.filter((m) => m.is_active && m.id !== appointment.mechanic_id).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                      <button className="secondary-button" disabled={busy || !assignments[appointment.id]} onClick={() => void perform(() => reassignAppointment(appointment.id, assignments[appointment.id]), 'Turno reasignado correctamente.')}>Reasignar</button>
                    </div>
                  )}
                </article>
              ))}
              {appointments.length === 0 && <p>No hay turnos registrados.</p>}
            </div>
          )}

          {tab === 'hours' && (
            <form className="admin-form admin-hours-form" onSubmit={submitHours}>
              <h3>Horario semanal del taller</h3>
              {hours.map((day) => (
                <div className="admin-hour-row" key={day.day_of_week}>
                  <strong>{weekdays[day.day_of_week]}</strong>
                  <label className="admin-check"><input type="checkbox" checked={day.is_closed} onChange={(e) => setHours(hours.map((h) => h.day_of_week === day.day_of_week ? { ...h, is_closed: e.target.checked } : h))} /> Cerrado</label>
                  <label>Desde<input type="time" disabled={day.is_closed} value={day.opens_at.slice(0, 5)} onChange={(e) => setHours(hours.map((h) => h.day_of_week === day.day_of_week ? { ...h, opens_at: e.target.value } : h))} /></label>
                  <label>Hasta<input type="time" disabled={day.is_closed} value={day.closes_at.slice(0, 5)} onChange={(e) => setHours(hours.map((h) => h.day_of_week === day.day_of_week ? { ...h, closes_at: e.target.value } : h))} /></label>
                </div>
              ))}
              <button className="submit-button" disabled={busy || hours.length !== 7}>Guardar horarios</button>
            </form>
          )}

          {tab === 'blocks' && (
            <div className="admin-layout">
              <form className="admin-form" onSubmit={submitBlock}>
                <h3>Crear bloqueo de agenda</h3>
                <label>Mecánico<select required value={blockForm.mechanicId} onChange={(e) => setBlockForm({ ...blockForm, mechanicId: e.target.value })}><option value="">Seleccionar mecánico</option>{mechanics.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
                <label>Inicio<input required type="datetime-local" value={blockForm.startsAt} onChange={(e) => setBlockForm({ ...blockForm, startsAt: e.target.value })} /></label>
                <label>Fin<input required type="datetime-local" value={blockForm.endsAt} onChange={(e) => setBlockForm({ ...blockForm, endsAt: e.target.value })} /></label>
                <label>Motivo<input maxLength={500} value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} /></label>
                <button className="submit-button" disabled={busy}>Crear bloqueo</button>
              </form>
              <div className="admin-list">
                <h3>Bloqueos registrados</h3>
                {blocks.map((block) => (
                  <article className="admin-item" key={block.id}>
                    <div>
                      <strong>{block.mechanic_name}</strong>
                      <p>{formatDate(block.starts_at)} – {formatDate(block.ends_at)}</p>
                      <small>{block.reason || 'Sin motivo indicado'}</small>
                    </div>
                    <button className="danger-button" disabled={busy} onClick={() => {
                      if (window.confirm('¿Eliminar este bloqueo?')) {
                        void perform(() => deleteMechanicBlock(block.id), 'Bloqueo eliminado.')
                      }
                    }}>Eliminar</button>
                  </article>
                ))}
                {blocks.length === 0 && <p>No hay bloqueos registrados.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default AdminDashboard