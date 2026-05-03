import type { Patient, Screening, OutcomeMeasurement } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | null): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function inRange(d: Date | undefined | null, from: Date | null, to: Date | null): boolean {
  if (!d) return false
  const dt = new Date(d)
  if (from && dt < from) return false
  if (to) {
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)
    if (dt > toEnd) return false
  }
  return true
}

function nextDueDate(s: Screening | null): Date | null {
  if (!s?.assessedAt) return null
  const d = new Date(s.assessedAt)
  d.setDate(d.getDate() + 14)
  return d
}

function dueStatus(s: Screening | null): string {
  const due = nextDueDate(s)
  if (!due) return '–'
  const days = Math.floor((due.getTime() - Date.now()) / 86400000)
  if (days < 0) return `Overdue (${Math.abs(days)}d)`
  if (days <= 3) return `Due Soon (${days}d)`
  return 'OK'
}

function latestScreeningForPatient(
  patientId: string,
  screenings: Screening[],
  dateFrom: Date | null,
  dateTo: Date | null
): Screening | null {
  let pool = screenings.filter(s => s.patientId === patientId)
  if (dateFrom || dateTo) pool = pool.filter(s => inRange(s.assessedAt as Date | undefined, dateFrom, dateTo))
  return pool.sort((a, b) => new Date(b.assessedAt!).getTime() - new Date(a.assessedAt!).getTime())[0] ?? null
}

// ── 1. Export Patient List (.xlsx) ───────────────────────────────────────────

export async function exportPatientList(
  patients: Patient[],
  screenings: Screening[],
  dateFrom: Date | null,
  dateTo: Date | null
) {
  const XLSX = await import('xlsx')

  const rows = patients
    .map(p => {
      const s = latestScreeningForPatient(p.id!, screenings, dateFrom, dateTo)
      if ((dateFrom || dateTo) && !s) return null
      return {
        HN: p.hn,
        'First Name': p.firstName,
        'Last Name': p.lastName,
        Age: p.age,
        Sex: p.sex,
        Nationality: p.nationality,
        Location: p.location,
        Level: s ? `L${s.overallLevel} – ${s.levelName}` : '–',
        'Program Type': s?.programType ?? '–',
        Cooperative: s?.cooperativeness === 'fully_cooperative'
          ? 'Cooperative' : s?.cooperativeness === 'non_cooperative'
          ? 'Non-Cooperative' : '–',
        CFS: s?.cfsScore ?? '–',
        'F Code': s ? `F${s.fLevel}` : '–',
        'R Code': s ? `R${s.rLevel}` : '–',
        'Assessment Date': fmtDate(s?.assessedAt as Date | undefined),
        'Next Due Date': fmtDate(nextDueDate(s)),
        Status: dueStatus(s),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(k => ({ wch: Math.max(k.length + 2, 14) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Patient List')

  const suffix = dateFrom
    ? `_${fmtDate(dateFrom).replace(/\//g, '-')}_${fmtDate(dateTo ?? new Date()).replace(/\//g, '-')}`
    : '_All'
  XLSX.writeFile(wb, `ChestPT_PatientList${suffix}.xlsx`)
}

// ── 2. Export Outcome Data (.xlsx) ───────────────────────────────────────────

export async function exportOutcomeData(
  patients: Patient[],
  outcomes: OutcomeMeasurement[],
  dateFrom: Date | null,
  dateTo: Date | null
) {
  const XLSX = await import('xlsx')

  const patientById: Record<string, Patient> = {}
  patients.forEach(p => { patientById[p.id!] = p })

  const pool = outcomes.filter(o =>
    !dateFrom && !dateTo ? true : inRange(o.recordedAt as Date | undefined, dateFrom, dateTo)
  )

  const SESSION_ORDER = ['Initial', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'Discharge']
  pool.sort((a, b) => {
    const hna = patientById[a.patientId]?.hn ?? ''
    const hnb = patientById[b.patientId]?.hn ?? ''
    if (hna !== hnb) return hna.localeCompare(hnb)
    return SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session)
  })

  const rows = pool.map(o => {
    const p = patientById[o.patientId]
    const it = o.items
    const v = (key: string) => it[key]?.value ?? ''
    return {
      HN: o.patientHn,
      'First Name': p?.firstName ?? '',
      'Last Name': p?.lastName ?? '',
      Session: o.session,
      'Date Recorded': fmtDate(o.recordedAt as Date | undefined),
      Level: `L${o.level}`,
      'AMPAC Part1 (/24)': v('ampac_part1'),
      'AMPAC Part2 (/24)': v('ampac_part2'),
      'AMPAC Part3 (/24)': v('ampac_part3'),
      'BRFA Part1 (%)': v('brfa_part1'),
      'BRFA Part2 (%)': v('brfa_part2'),
      'BRFA Q20 (%)': v('brfa_q20'),
      'BRFA Q21 (%)': v('brfa_q21'),
      'Dyspnea Scale (/10)': v('dyspneaScale'),
      'Peak Cough Flow (L/min)': v('peakCoughFlow'),
      'Wright Spirometry (mL)': v('wrightSpirometer'),
      'Grip Left (kg)': v('gripStrength_left'),
      'Grip Right (kg)': v('gripStrength_right'),
      'CS-30 (stands)': v('cs30'),
      '6-Minute Walk Test (m)': v('sixMWT'),
      '2-min Marching (steps)': v('twoMinMarching'),
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(k => ({ wch: Math.max(k.length + 2, 12) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Outcome Data')

  const suffix = dateFrom
    ? `_${fmtDate(dateFrom).replace(/\//g, '-')}_${fmtDate(dateTo ?? new Date()).replace(/\//g, '-')}`
    : '_All'
  XLSX.writeFile(wb, `ChestPT_OutcomeData${suffix}.xlsx`)
}

// ── 3. Export Monthly Summary (.xlsx) ────────────────────────────────────────

export async function exportMonthlySummary(
  patients: Patient[],
  screenings: Screening[],
  year: number,
  month: number // 0-indexed
) {
  const XLSX = await import('xlsx')

  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59)

  const monthScreenings = screenings.filter(s =>
    s.assessedAt && inRange(s.assessedAt as Date, monthStart, monthEnd)
  )
  const patientIdsInMonth = [...new Set(monthScreenings.map(s => s.patientId))]

  // New vs Returning
  let newCount = 0, returningCount = 0
  for (const pid of patientIdsInMonth) {
    const allSorted = screenings
      .filter(s => s.patientId === pid && s.assessedAt)
      .sort((a, b) => new Date(a.assessedAt!).getTime() - new Date(b.assessedAt!).getTime())
    const first = allSorted[0]
    if (first && new Date(first.assessedAt!) >= monthStart) newCount++
    else returningCount++
  }

  // Latest screening per patient in month → level + program
  const latestPerPat: Record<string, Screening> = {}
  monthScreenings.forEach(s => {
    const cur = latestPerPat[s.patientId]
    if (!cur || new Date(s.assessedAt!).getTime() > new Date(cur.assessedAt!).getTime()) {
      latestPerPat[s.patientId] = s
    }
  })
  const levelCounts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  const progCounts = { Standard: 0, Intensive: 0 }
  Object.values(latestPerPat).forEach(s => {
    levelCounts[s.overallLevel as 1|2|3|4]++
    progCounts[s.programType]++
  })

  // Weekly breakdown
  type WeekRow = [string, number, number, number, number]
  const weekRows: WeekRow[] = []
  let wStart = new Date(monthStart)
  let wNum = 1
  while (wStart <= monthEnd) {
    const wEnd = new Date(wStart)
    wEnd.setDate(wEnd.getDate() + 6)
    const we = wEnd > monthEnd ? new Date(monthEnd) : wEnd

    const wS = monthScreenings.filter(s => inRange(s.assessedAt as Date, wStart, we))
    const wPids = [...new Set(wS.map(s => s.patientId))]
    const wNew = wPids.filter(pid => {
      const all = screenings.filter(s => s.patientId === pid && s.assessedAt)
        .sort((a, b) => new Date(a.assessedAt!).getTime() - new Date(b.assessedAt!).getTime())
      const first = all[0]
      return first && new Date(first.assessedAt!) >= monthStart
    }).length

    const label = `Week ${wNum} (${wStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}–${we.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })})`
    weekRows.push([label, wS.length, wPids.length, wNew, wPids.length - wNew])

    wStart.setDate(we.getDate() + 1)
    wStart = new Date(year, month, we.getDate() + 1)
    wNum++
    if (wStart.getMonth() !== month) break
  }

  const monthLabel = monthStart.toLocaleDateString('en', { month: 'long', year: 'numeric' })

  const aoa: (string | number)[][] = [
    [`Chest PT Monthly Summary — ${monthLabel}`],
    ['Generated:', fmtDate(new Date())],
    [],
    ['OVERVIEW'],
    ['Total Unique Patients', patientIdsInMonth.length],
    ['Total Assessments', monthScreenings.length],
    ['New Patients', newCount],
    ['Returning Patients', returningCount],
    [],
    ['LEVEL DISTRIBUTION'],
    ['Level 1 — Mild', levelCounts[1]],
    ['Level 2 — Moderate', levelCounts[2]],
    ['Level 3 — Mild Severe', levelCounts[3]],
    ['Level 4 — Severe', levelCounts[4]],
    [],
    ['PROGRAM TYPE'],
    ['Standard', progCounts.Standard],
    ['Intensive', progCounts.Intensive],
    [],
    ['WEEKLY BREAKDOWN'],
    ['Week', 'Assessments', 'Unique Patients', 'New', 'Returning'],
    ...weekRows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 42 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')

  const monthKey = monthStart.toLocaleDateString('en', { month: 'short', year: 'numeric' }).replace(' ', '')
  XLSX.writeFile(wb, `ChestPT_Summary_${monthKey}.xlsx`)
}

// ── 4. Export Charts PDF ─────────────────────────────────────────────────────

export async function exportChartsPDF(
  element: HTMLElement,
  stats: { totalPatients: number; weekAssessments: number; monthAssessments: number; levelCounts: Record<number, number> },
  dateFrom: Date | null,
  dateTo: Date | null
) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const canvas = await html2canvas(element, {
    scale: 1.8,
    useCORS: true,
    backgroundColor: '#f8fafc',
    logging: false,
    allowTaint: true,
  })

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10

  // Header block
  pdf.setFillColor(29, 78, 216)
  pdf.rect(0, 0, pageW, 22, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(255, 255, 255)
  pdf.text('Chest PT Screening — Dashboard Report', margin, 10)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  const rangeText = dateFrom
    ? `Date range: ${fmtDate(dateFrom)} – ${fmtDate(dateTo ?? new Date())}`
    : 'Date range: All time'
  pdf.text(`${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}   ${rangeText}`, margin, 17)

  // Summary stats bar
  const statY = 26
  pdf.setTextColor(30, 30, 30)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  const statItems = [
    `Patients: ${stats.totalPatients}`,
    `This week: ${stats.weekAssessments}`,
    `This month: ${stats.monthAssessments}`,
    `L1: ${stats.levelCounts[1]}  L2: ${stats.levelCounts[2]}  L3: ${stats.levelCounts[3]}  L4: ${stats.levelCounts[4]}`,
  ]
  pdf.text(statItems.join('   |   '), margin, statY)

  // Chart image — fit to remaining page height
  const imgData = canvas.toDataURL('image/png')
  const contentY = statY + 5
  const contentH = pageH - contentY - margin
  const contentW = pageW - margin * 2
  const imgRatio = canvas.height / canvas.width
  let drawW = contentW
  let drawH = drawW * imgRatio
  if (drawH > contentH) {
    drawH = contentH
    drawW = drawH / imgRatio
  }
  const imgX = margin + (contentW - drawW) / 2
  pdf.addImage(imgData, 'PNG', imgX, contentY, drawW, drawH)

  const suffix = dateFrom ? `_${fmtDate(dateFrom).replace(/\//g, '-')}` : ''
  pdf.save(`ChestPT_Dashboard${suffix}.pdf`)
}
