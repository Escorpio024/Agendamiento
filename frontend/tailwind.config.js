/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                aurora: {
                    sidebar:  '#1E1B26',
                    dark:     '#1A1721',
                    chat:     '#0F0E13',
                    purple:   '#8263B1',
                    deep:     '#2D283E',
                    accent:   '#A1E3D8',
                    text:     '#F5F5F7',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
