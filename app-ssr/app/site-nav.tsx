'use client'

export function HomeNav() {
  return (
    <nav className="nav">
      <a className="nav-item active" href="/">文字</a>
      <a className="nav-item" href="/twit">
        <div className="message">
          <div>
            <div className="message-text">发言</div>
            <div className="message-icon" />
          </div>
        </div>
      </a>
      <a className="nav-item" href="/playground">
        <div className="playground">
          <div>play</div>
          <div>ground</div>
        </div>
      </a>
      <a className="nav-item" href="/profile">个人</a>
    </nav>
  )
}
