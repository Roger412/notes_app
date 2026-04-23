export type ControllerButton =
  | 'up' | 'down' | 'left' | 'right'
  | 'a' | 'b' | 'x' | 'y'
  | 'start' | 'select'
  | 'l1' | 'r1'

export interface ButtonPressEvent {
  button: ControllerButton
  pressed: boolean
  timestamp: number
}

export interface ServerToClientEvents {
  'controller:button': (event: ButtonPressEvent) => void
  'controller:connected': (deviceId: string) => void
  'controller:disconnected': (deviceId: string) => void
}

export interface ClientToServerEvents {
  'controller:button': (event: ButtonPressEvent) => void
  'controller:join': (roomId: string) => void
  'controller:leave': (roomId: string) => void
}
