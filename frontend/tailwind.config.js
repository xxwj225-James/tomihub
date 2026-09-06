/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          main:    'hsl(var(--brand))',
          hover:   'hsl(var(--brand-hover))',
          soft:    'hsl(var(--brand-soft))',
          text:    'hsl(var(--brand-text))',
        },
        surface: {
          app:     'hsl(var(--surface-app))',
          card:    'hsl(var(--surface-card))',
          hover:   'hsl(var(--surface-hover))',
          sidebar: 'hsl(var(--surface-sidebar))',
        },
        ink: {
          primary:   'hsl(var(--ink-primary))',
          secondary: 'hsl(var(--ink-secondary))',
          muted:     'hsl(var(--ink-muted))',
          sidebar:   'hsl(var(--ink-sidebar))',
          'sidebar-active': 'hsl(var(--ink-sidebar-active))',
        },
        edge: {
          DEFAULT: 'hsl(var(--edge-default))',
          hover:   'hsl(var(--edge-hover))',
          sidebar: 'hsl(var(--edge-sidebar))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          soft:    'hsl(var(--danger-soft))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft:    'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft:    'hsl(var(--warning-soft))',
        },
      },
      borderRadius: {
        card:  'var(--radius-card)',
        btn:   'var(--radius-btn)',
        input: 'var(--radius-input)',
      },
      boxShadow: {
        card:        'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        dialog:      'var(--shadow-dialog)',
      },
      fontFamily: {
        ui:   'var(--font-ui)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
};
