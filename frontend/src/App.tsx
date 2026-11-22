import { useState, type FormEvent } from 'react'
import { useAuth } from './context/useAuth'
import './App.css'
import BicycleManager from './components/BicycleManager'
import ServiceCatalog from './components/ServiceCatalog'
import AppointmentBooking from './components/AppointmentBooking'
import MyAppointments from './components/MyAppointments'
import MechanicDashboard from './components/MechanicDashboard'
import AdminDashboard from './components/AdminDashboard'


function App() {
  const { user, loading, login, register, logout } = useAuth()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register({
          fullName,
          email,
          password,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        })
        setSuccess('¡Tu cuenta fue creada correctamente!')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo completar la operación.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode: 'login' | 'register') {
    setMode(nextMode)
    setError('')
    setSuccess('')
    setPassword('')
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="spinner" />
        <p>Verificando tu sesión...</p>
      </main>
    )
  }

  if (user) {
    const roleNames: Record<string, string> = {
      CLIENTE: 'Cliente',
      MECANICO: 'Mecánico',
      ADMINISTRADOR: 'Administrador',
    }

    return (
      <main className="dashboard">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-icon">TP</span>
            <span>Taller <strong>Pedal</strong></span>
          </a>
          <button className="logout-button" onClick={logout}>
            Cerrar sesión
          </button>
        </header>

        <section className="welcome-card">
          <span className="eyebrow">TALLER PEDAL</span>
          <h1>¡Hola, {user.fullName}!</h1>
          <p>Ya estás dentro de tu cuenta.</p>
          <div className="user-details">
            <div>
              <span>Correo electrónico</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span>Tipo de cuenta</span>
              <strong>{roleNames[user.role] || user.role}</strong>
            </div>
          </div>
        </section>
        {user.role === 'CLIENTE' && <BicycleManager />}
        {user.role === 'CLIENTE' && <ServiceCatalog />}
        {user.role === 'CLIENTE' && <AppointmentBooking />}
        {user.role === 'CLIENTE' && <MyAppointments />}
        {user.role === 'MECANICO' && <MechanicDashboard />}
        {user.role === 'ADMINISTRADOR' && <AdminDashboard />}
      </main>
    )
  }

  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <a className="brand brand-light" href="/">
          <span className="brand-icon">TP</span>
          <span>Taller <strong>Pedal</strong></span>
        </a>

        <div className="brand-message">
          <span className="eyebrow">CUIDAMOS TU BICICLETA</span>
          <h1>Tu próxima aventura empieza con una bici en buenas manos.</h1>
          <p>
            Gestioná tus servicios, turnos y reparaciones desde un solo lugar.
          </p>
        </div>

        <div className="brand-footer">
          <span>Pasión por las bicicletas.</span>
          <span>© Taller Pedal</span>
        </div>
      </section>

      <section className="form-panel">
        <div className="auth-card">
          <div className="mobile-brand">
            <span className="brand-icon">TP</span>
            <span>Taller <strong>Pedal</strong></span>
          </div>

          <div className="form-heading">
            <span className="eyebrow">
              {mode === 'login' ? 'BIENVENIDO DE NUEVO' : 'SUMATE A TALLER PEDAL'}
            </span>
            <h2>
              {mode === 'login' ? 'Iniciá sesión' : 'Creá tu cuenta'}
            </h2>
            <p>
              {mode === 'login'
                ? 'Ingresá tus datos para continuar.'
                : 'Completá tus datos para registrarte como cliente.'}
            </p>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => changeMode('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => changeMode('register')}
            >
              Registrarme
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label>
                Nombre completo
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Tu nombre y apellido"
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                  required
                />
              </label>
            )}

            <label>
              Correo electrónico
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@correo.com"
                maxLength={255}
                autoComplete="email"
                required
              />
            </label>

            {mode === 'register' && (
              <label>
                Teléfono <span className="optional">(opcional)</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Tu número de teléfono"
                  maxLength={40}
                  autoComplete="tel"
                />
              </label>
            )}

            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                minLength={mode === 'register' ? 8 : undefined}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              {mode === 'register' && (
                <span className="field-hint">Mínimo 8 caracteres.</span>
              )}
            </label>

            {error && <div className="message error">{error}</div>}
            {success && <div className="message success">{success}</div>}

            <button className="submit-button" type="submit" disabled={submitting}>
              {submitting
                ? 'Procesando...'
                : mode === 'login'
                  ? 'Ingresar a mi cuenta'
                  : 'Crear mi cuenta'}
            </button>
          </form>

          <p className="switch-hint">
            {mode === 'login' ? '¿Todavía no tenés cuenta?' : '¿Ya tenés cuenta?'}
            {' '}
            <button
              type="button"
              className="text-button"
              onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Registrate' : 'Iniciá sesión'}
            </button>
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
