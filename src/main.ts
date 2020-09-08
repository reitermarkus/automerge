import * as core from '@actions/core'

import { Input } from './input'

async function run(): Promise<void> {
  try {
    const input = new Input()

    core.info(JSON.stringify(input))
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
