import { createContext, useContext, useState } from 'react'

interface Theme {
  name: 'light' | 'dark'
  user: string
  toggle: () => void
}

const ThemeContext = createContext<Theme>({
  name: 'light',
  user: 'anonymous',
  toggle: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<'light' | 'dark'>('light')

  const value: Theme = {
    name,
    user: 'sam',
    toggle: () => setName(name === 'light' ? 'dark' : 'light'),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
