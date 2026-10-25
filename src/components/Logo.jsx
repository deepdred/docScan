export default function Logo({ size = 32, inverted = false }) {
  const fg = inverted ? '#17171C' : '#ffffff'
  const bg = inverted ? '#ffffff' : '#17171C'
  const check = '#FF7759'
  return (
    <span className="logo-mark" aria-hidden="true" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="7.5" fill={bg} />
        <path
          d="M10 5.5h5.4L20 10.1V22.5C20 23.0523 19.5523 23.5 19 23.5H10C9.44772 23.5 9 23.0523 9 22.5V6.5C9 5.94772 9.44772 5.5 10 5.5Z"
          stroke={fg}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M15 5.5V10.5H20" stroke={fg} strokeWidth="1.8" strokeLinejoin="round" />
        <path
          d="M21.5 15.2L26.2 17.1V20.9C26.2 23.9 24.2 25.9 21.5 26.8C18.8 25.9 16.8 23.9 16.8 20.9V17.1L21.5 15.2Z"
          fill={check}
          stroke={bg}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M19.4 20.9L20.9 22.4L23.7 19.2"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
