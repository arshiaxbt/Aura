/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{tsx,ts,jsx,js}"],
    theme: {
        extend: {
            colors: {
                surface: {
                    DEFAULT: '#1C1B1F',
                    dim: '#2B2930',
                    bright: '#3A383E',
                },
                primary: {
                    DEFAULT: '#D0BCFF',
                    container: '#4A4458',
                },
                on: {
                    surface: '#E6E1E5',
                    'surface-variant': '#CAC4D0',
                },
                outline: {
                    DEFAULT: '#49454F',
                    variant: '#938F99',
                },
                error: '#F2B8B5',
            },
            fontFamily: {
                sans: ['Roboto', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
                mono: ['Roboto Mono', 'monospace'],
            },
            animation: {
                'bounce-slow': 'bounce-slow 3s ease-in-out infinite',
            },
            keyframes: {
                'bounce-slow': {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
            },
        },
    },
    plugins: [
        require('tailwindcss-animate'),
    ],
}
