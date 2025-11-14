export type User = {
  id: string
  email: string
  full_name?: string
  role: 'master' | 'silver'
  created_at: string
}

export type Project = {
  id: number
  name: string
  description?: string
  start_date?: string
  end_date?: string
  status: string
}

export type Task = {
  id: number
  project_id: number
  title?: string
  assigned_to?: string
  target_date?: string
  progress: number
  row_index?: number
  description?: string
  weight?: number
  plan_progress?: number
  actual_progress?: number
  color?: string
  note?: string
  last_update?: string
}

export type Shipment = {
  id: number
  project_id: number
  item_name?: string
  total_items?: number
  shipped_items?: number
  status?: string
  tracking_code?: string
  last_lat?: number
  last_lng?: number
  updated_at?: string
}

export type Upload = {
  id: number
  project_id: number
  task_id: number
  user_id: string
  filename: string
  url: string
  created_at: string
}
