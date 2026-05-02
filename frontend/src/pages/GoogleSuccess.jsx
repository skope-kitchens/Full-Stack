import { useNavigate } from 'react-router-dom'

const GoogleSuccess = () => {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Google Calendar Connected Successfully</h1>
      <button
        onClick={() => navigate('/')}
        style={{ padding: '0.6rem 1.4rem', fontSize: '1rem', cursor: 'pointer', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px' }}
      >
        Go to Dashboard
      </button>
    </div>
  )
}

export default GoogleSuccess
