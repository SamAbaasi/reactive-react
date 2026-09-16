import { describe, expect, it, vi } from 'vitest'
import { createSignal } from '@rrjs/signals'
import { createPortal, h, list, mount, unmountNode } from '../src/index'

describe('DOM behavior', () => {
  it('commits a portal into its target and disposes it with the source owner', () => {
    const [value, setValue] = createSignal(0)
    const read = vi.fn(() => value())
    const target = document.createElement('aside')
    const host = document.createElement('div')
    document.body.append(target, host)
    const dispose = mount(() => h('main', null,
      h('span', null, 'inline'),
      createPortal(h('button', { title: read, onClick: () => setValue(value() + 1) }, read), target),
    ), host)
    const button = target.querySelector('button')!
    expect(host.textContent).toBe('inline')
    expect(button.textContent).toBe('0')
    button.click()
    expect(target.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('1')
    dispose()
    expect(target.childNodes).toHaveLength(0)
    read.mockClear()
    button.click()
    setValue(3)
    expect(read).not.toHaveBeenCalled()
    target.remove()
    host.remove()
  })

  it('rejects unsupported portal targets and keys explicitly', () => {
    expect(() => createPortal('child', {} as Element)).toThrow(/target/)
    expect(() => createPortal('child', document.createElement('div'), 'key' as never)).toThrow(/keys/)
  })

  it('creates SVG and foreignObject descendants in their compiler-declared namespaces', () => {
    const circle = h('circle', { __rrjsNamespace: 'svg', className: 'dot', strokeWidth: 2, xlinkHref: '#source' }) as SVGCircleElement
    const html = h('div', { className: 'inside' }, 'html') as HTMLDivElement
    const foreign = h('foreignObject', { __rrjsNamespace: 'svg' }, html) as SVGForeignObjectElement
    const svg = h('svg', { __rrjsNamespace: 'svg', viewBox: '0 0 10 10' }, circle, foreign) as SVGSVGElement
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(foreign.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(html.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    expect(circle.getAttribute('class')).toBe('dot')
    expect(circle.getAttribute('stroke-width')).toBe('2')
    expect(circle.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#source')
    expect(svg.getAttribute('viewBox')).toBe('0 0 10 10')
    unmountNode(svg)
  })
  it('removes and restores a conditional child in its original position', () => {
    const [visible, setVisible] = createSignal(true)
    const host = h('div', null, 'before', () => visible() ? h('b', null, 'middle') : null, 'after') as HTMLElement
    setVisible(false)
    expect(host.textContent).toBe('beforeafter')
    expect(host.querySelector('b')).toBeNull()
    setVisible(true)
    expect(host.textContent).toBe('beforemiddleafter')
    expect(host.querySelectorAll('b')).toHaveLength(1)
    unmountNode(host)
  })

  it('normalizes nested arrays, nodes, primitives and empty children', () => {
    const [expanded, setExpanded] = createSignal(false)
    const host = h('div', null, () => expanded()
      ? [h('span', null, 'A'), [null, false, 0, h('b', null, 'B')]]
      : 'empty') as HTMLElement
    setExpanded(true)
    expect(host.textContent).toBe('A0B')
    expect(host.querySelectorAll('span, b')).toHaveLength(2)
    setExpanded(false)
    expect(host.textContent).toBe('empty')
    expect(host.querySelectorAll('*')).toHaveLength(0)
    unmountNode(host)
  })

  it('preserves nodes when a reactive array reorders them', () => {
    const a = h('input', { value: 'A' }) as HTMLInputElement
    const b = h('input', { value: 'B' }) as HTMLInputElement
    const [nodes, setNodes] = createSignal([a, b])
    const host = h('div', null, nodes) as HTMLElement
    a.value = 'typed'
    setNodes([b, a])
    expect(Array.from(host.children)).toEqual([b, a])
    expect(a.value).toBe('typed')
    unmountNode(host)
  })

  it('delivers React-style double-click events', () => {
    const handler = vi.fn()
    const el = h('span', { onDoubleClick: handler }, 'edit') as HTMLElement
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
    unmountNode(el)
  })

  it('delivers React-style onChange timing for text and checkbox inputs', () => {
    const textChange = vi.fn()
    const text = h('input', { type: 'text', onChange: textChange }) as HTMLInputElement
    text.dispatchEvent(new Event('input', { bubbles: true }))
    text.dispatchEvent(new Event('change', { bubbles: true }))
    expect(textChange).toHaveBeenCalledTimes(1)

    const checkboxChange = vi.fn()
    const checkbox = h('input', { type: 'checkbox', onChange: checkboxChange }) as HTMLInputElement
    checkbox.dispatchEvent(new Event('input', { bubbles: true }))
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    expect(checkboxChange).toHaveBeenCalledTimes(1)
    unmountNode(text)
    unmountNode(checkbox)
  })

  it('maps textarea, select, radio and explicit input/change handlers', () => {
    const textareaChange = vi.fn()
    const textarea = h('textarea', { onChange: textareaChange }) as HTMLTextAreaElement
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    expect(textareaChange).toHaveBeenCalledTimes(1)

    const selectChange = vi.fn()
    const select = h('select', { onChange: selectChange }, h('option', { value: 'a' }, 'a')) as HTMLSelectElement
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(selectChange).toHaveBeenCalledTimes(1)

    const radioChange = vi.fn()
    const radio = h('input', { type: 'radio', onChange: radioChange }) as HTMLInputElement
    radio.dispatchEvent(new Event('input', { bubbles: true }))
    radio.dispatchEvent(new Event('change', { bubbles: true }))
    expect(radioChange).toHaveBeenCalledTimes(1)

    const onInput = vi.fn()
    const onChange = vi.fn()
    const text = h('input', { type: 'text', onInput, onChange }) as HTMLInputElement
    text.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)

    for (const node of [textarea, select, radio, text]) unmountNode(node)
  })

  it('applies a controlled select value after its options exist', () => {
    const [value, setValue] = createSignal('medium')
    const select = h('select', { value },
      h('option', { value: 'low' }, 'low'),
      h('option', { value: 'medium' }, 'medium'),
      h('option', { value: 'high' }, 'high')) as HTMLSelectElement
    expect(select.value).toBe('medium')
    setValue('high')
    expect(select.value).toBe('high')
    unmountNode(select)
  })

  it('updates the live input value after the user has edited it', () => {
    const [value, setValue] = createSignal('initial')
    const input = h('input', { value }) as HTMLInputElement
    input.value = 'typed'
    setValue('reset')
    expect(input.value).toBe('reset')
    unmountNode(input)
  })

  it('updates the live checkbox state after user interaction', () => {
    const [checked, setChecked] = createSignal(true)
    const input = h('input', { type: 'checkbox', checked }) as HTMLInputElement
    input.checked = false
    input.checked = true
    setChecked(false)
    expect(input.checked).toBe(false)
    unmountNode(input)
  })

  it('does not run text or attribute bindings after unmount', () => {
    const [value, setValue] = createSignal(0)
    const readText = vi.fn(() => String(value()))
    const readTitle = vi.fn(() => String(value()))
    for (let i = 0; i < 5; i++) {
      const host = document.createElement('div')
      const dispose = mount(() => h('div', { title: readTitle }, readText), host)
      dispose()
      readText.mockClear()
      readTitle.mockClear()
      setValue(i + 1)
      expect(readText).not.toHaveBeenCalled()
      expect(readTitle).not.toHaveBeenCalled()
    }
  })

  it('disposes the bindings of replaced conditional children', () => {
    const [visible, setVisible] = createSignal(true)
    const [value, setValue] = createSignal(0)
    const read = vi.fn(() => value())
    const host = h('div', null, () => visible() ? h('span', null, read) : null) as HTMLElement
    setVisible(false)
    read.mockClear()
    setValue(1)
    expect(read).not.toHaveBeenCalled()
    unmountNode(host)
  })

  it('updates reused row content while appending', () => {
    const [rows, setRows] = createSignal([{ id: 1, label: 'A' }])
    const host = h('div', null, list(rows, r => r.id, r => h('span', null, () => r.label) as Node)) as HTMLElement
    const first = host.querySelector('span')
    setRows([{ id: 1, label: 'B' }, { id: 2, label: 'C' }])
    expect(host.textContent).toBe('BC')
    expect(host.querySelector('span')).toBe(first)
    unmountNode(host)
  })

  it.each(['remove', 'clear'] as const)('disposes row bindings on %s', operation => {
    const [value, setValue] = createSignal(0)
    const [rows, setRows] = createSignal([{ id: 1 }, { id: 2 }])
    const read = vi.fn((id: number) => `${id}:${value()}`)
    const host = h('div', null, list(rows, r => r.id, r => h('span', null, () => read(r.id)) as Node)) as HTMLElement
    setRows(operation === 'clear' ? [] : [rows()[1]])
    read.mockClear()
    setValue(1)
    expect(read.mock.calls.map(args => args[0])).toEqual(operation === 'clear' ? [] : [2])
    unmountNode(host)
    read.mockClear()
    setRows([{ id: 3 }])
    expect(read).not.toHaveBeenCalled()
  })
})
