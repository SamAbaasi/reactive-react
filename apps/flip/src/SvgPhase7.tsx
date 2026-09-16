import { useState } from 'react'
import { createPortal } from 'react-dom'

const portalTarget = document.createElement('aside')
portalTarget.id = 'phase7-portal-target'
document.body.appendChild(portalTarget)

export function SvgPhase7() {
  const [radius, setRadius] = useState(4)
  const [shown, setShown] = useState(true)

  return (
    <main>
      <button className="increment" onClick={() => setRadius(radius + 1)}>Increment</button>
      <button className="toggle" onClick={() => setShown(!shown)}>Toggle use</button>
      {shown && createPortal(
        <button data-kind="portal" title={radius} onClick={() => setRadius(radius + 1)}>portal:{radius}</button>,
        portalTarget,
      )}
      <svg data-kind="svg" viewBox="0 0 40 20" className={radius > 4 ? 'large' : 'small'}>
        <g data-kind="group" strokeWidth={radius}>
          <circle data-kind="circle" id="dot" cx={radius} cy="5" r={radius} onClick={() => setRadius(radius + 1)} />
          <text data-kind="text">{radius}</text>
          {shown && <use data-kind="use" href="#dot" xlinkHref="#dot" />}
          <foreignObject data-kind="foreign" x="20" y="0" width="20" height="20">
            <div data-kind="html" className="inside">html:{radius}</div>
          </foreignObject>
        </g>
      </svg>
    </main>
  )
}
