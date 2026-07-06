// hardware-scan.ts - lokale, read-only Hardware-Erfassung fuer System-Umgebung.
// Keine Secrets, keine Persistenz: CPU/RAM via node:os, NVIDIA-GPU via nvidia-smi.
import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'
import type { SystemArea, SystemEntry } from '@shared/contract'

const execFileAsync = promisify(execFile)

function gbFromBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 ** 3)} GB`
}

function gbFromMib(mib: number): string {
  return `${Math.round(mib / 1024)} GB`
}

function cpuEntry(): SystemEntry {
  const cpus = os.cpus()
  const model = cpus[0]?.model?.trim() || 'CPU'
  return {
    id: 'cpu',
    name: model,
    status: 'active',
    v: `${cpus.length} Threads`,
    desc: `${os.platform()} ${os.release()}`,
    fields: {
      Threads: String(cpus.length),
      Architektur: os.arch(),
      Host: os.hostname(),
    },
  }
}

function memoryEntry(): SystemEntry {
  const total = os.totalmem()
  return {
    id: 'ram',
    name: 'Arbeitsspeicher',
    status: 'active',
    v: gbFromBytes(total),
    desc: 'Gesamter physischer RAM laut Betriebssystem.',
    fields: { Bytes: String(total) },
  }
}

function parseNvidiaCsv(raw: string): SystemEntry[] {
  return raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx): SystemEntry | null => {
      const [nameRaw, memRaw, driverRaw] = line.split(',').map((p) => p.trim())
      const mem = Number.parseInt(memRaw ?? '', 10)
      if (!nameRaw || Number.isNaN(mem)) return null
      return {
        id: `gpu-${idx + 1}`,
        name: nameRaw,
        status: 'active',
        v: `${gbFromMib(mem)} VRAM`,
        desc: `NVIDIA-Treiber ${driverRaw || 'unbekannt'}`,
        fields: {
          VRAM: `${mem} MiB`,
          Treiber: driverRaw || 'unbekannt',
          Quelle: 'nvidia-smi',
        },
      }
    })
    .filter((entry): entry is SystemEntry => entry !== null)
}

async function gpuEntries(): Promise<SystemEntry[]> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits',
    ], { timeout: 1800, windowsHide: true, encoding: 'utf8' })
    return parseNvidiaCsv(String(stdout ?? ''))
  } catch {
    return []
  }
}

export async function scanHardwareArea(): Promise<SystemArea> {
  const gpus = await gpuEntries()
  return {
    id: 'hardware',
    label: 'Hardware',
    icon: 'cpu',
    blurb: 'CPU, RAM und GPU lokal erkannt (read-only).',
    entries: [cpuEntry(), memoryEntry(), ...gpus],
  }
}
