import type { ClientModule } from 'claude-code'

import type { Run } from './cells'

// RISK #2 probe: a Client region draws the scene as Text runs and hears the pointer,
// so a click anywhere on the pet posts { pet: true } to the hooks module.
type Props = { runs: Run[][] }
type State = { isListening: true }

const SceneClient: ClientModule<Props, State> = (props, surface) => {
  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'down' && (event.button ?? 'left') === 'left') surface.post({ pet: true })
    })
    surface.setState({ isListening: true })
  }
  const { Box, Text } = surface.elements
  const runs = Array.isArray(props?.runs) ? props.runs : []
  return (
    <Box flexDirection="column">
      {runs.map(row => (
        <Box flexDirection="row">
          {row.map(run => (
            <Text {...(run.color ? { color: run.color } : {})} {...(run.backgroundColor ? { backgroundColor: run.backgroundColor } : {})}>
              {run.text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default SceneClient
