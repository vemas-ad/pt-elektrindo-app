import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qpqjlpqxxluedxgzzatp.supabase.co' // ganti dengan URL kamu
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwcWpscHF4eGx1ZWR4Z3p6YXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwOTkxNDYsImV4cCI6MjA3NjY3NTE0Nn0.pGuG1M_8QyxHfxY8qsCvz5H-tvS_mRwo6YhGp3Kx4tY' // ganti dengan kunci kamu
export const supabase = createClient(supabaseUrl, supabaseKey)
