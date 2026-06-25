import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle,
} from 'docx'

export type TailoredCV = {
  full_name: string
  email: string
  phone: string
  location: string
  linkedin: string
  professional_summary: string
  skills_to_highlight: string[]
  experience: Array<{ company: string; role: string; dates: string; bullets: string[] }>
  education: Array<{ institution: string; degree: string; dates: string }>
  languages: string[]
}

export type JobSummary = {
  company: string
  role: string
  location: string | null
}

export async function buildCvDocx(tailored: TailoredCV, job: JobSummary): Promise<Buffer> {
  const BRAND   = '2E3192'
  const DARK    = '111827'
  const MUTED   = '6B7280'
  const DIVIDER = '9CA3AF'

  // Plain paragraph — no Word heading style, no inheritance, direct formatting only.
  // ATS parsers identify sections by uppercase bold keywords in the text, which is
  // the primary mechanism for Workday, Greenhouse, Lever, and iCIMS.
  const sectionHeading = (text: string) => new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: BRAND, font: 'Calibri' })],
    spacing: { before: 360, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DIVIDER } },
  })

  const bullet = (text: string, after = 60) => new Paragraph({
    children: [new TextRun({ text: `• ${text}`, size: 20, color: DARK, font: 'Calibri' })],
    spacing: { after },
  })

  const children: Paragraph[] = []

  // Name
  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 52, color: DARK, font: 'Calibri' })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 80 },
  }))

  // Contact details — each field on its own paragraph so ATS regex extraction works reliably
  if (tailored.email) {
    children.push(new Paragraph({
      children: [new TextRun({ text: tailored.email, size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 20 },
    }))
  }
  const phoneLine = [tailored.phone, tailored.location].filter(Boolean)
  if (phoneLine.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: phoneLine.join('  |  '), size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 20 },
    }))
  }
  if (tailored.linkedin) {
    children.push(new Paragraph({
      children: [new TextRun({ text: tailored.linkedin, size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 60 },
    }))
  }

  // Professional Summary
  children.push(sectionHeading('Professional Summary'))
  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.professional_summary, size: 20, color: DARK, font: 'Calibri' })],
    spacing: { after: 200 },
  }))

  // Key Skills
  if (tailored.skills_to_highlight?.length) {
    children.push(sectionHeading('Key Skills'))
    tailored.skills_to_highlight.forEach((skill, i) => {
      const isLast = i === tailored.skills_to_highlight.length - 1
      children.push(new Paragraph({
        children: [new TextRun({ text: `• ${skill}`, size: 19, font: 'Calibri', color: DARK })],
        spacing: { after: isLast ? 200 : 40 },
      }))
    })
  }

  // Experience
  if (tailored.experience?.length) {
    children.push(sectionHeading('Experience'))
    tailored.experience.forEach((exp, i) => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: exp.role, bold: true, size: 22, color: DARK, font: 'Calibri' }),
          new TextRun({ text: exp.company, size: 20, color: MUTED, font: 'Calibri', break: 1 }),
          new TextRun({ text: exp.dates, size: 17, color: MUTED, italics: true, font: 'Calibri', break: 1 }),
        ],
        spacing: { before: i === 0 ? 0 : 0, after: 60 },
      }))
      const isLastEntry = i === tailored.experience.length - 1
      exp.bullets.forEach((b, bi) => {
        const isLastBullet = bi === exp.bullets.length - 1
        const after = isLastBullet ? (isLastEntry ? 200 : 240) : 60
        children.push(bullet(b, after))
      })
    })
  }

  // Education
  if (tailored.education?.length) {
    children.push(sectionHeading('Education'))
    tailored.education.forEach((edu, i) => {
      const isLast = i === tailored.education.length - 1
      children.push(new Paragraph({
        children: [
          new TextRun({ text: edu.degree, bold: true, size: 20, color: DARK, font: 'Calibri' }),
          new TextRun({ text: edu.institution, size: 19, color: MUTED, font: 'Calibri', break: 1 }),
          new TextRun({ text: edu.dates, size: 17, color: MUTED, italics: true, font: 'Calibri', break: 1 }),
        ],
        spacing: { before: i === 0 ? 0 : 120, after: isLast ? 200 : 60 },
      }))
    })
  }

  // Languages
  if (tailored.languages?.length) {
    children.push(sectionHeading('Languages'))
    tailored.languages.forEach((lang, i) => {
      const isLast = i === tailored.languages.length - 1
      children.push(new Paragraph({
        children: [new TextRun({ text: `• ${lang}`, size: 19, font: 'Calibri', color: DARK })],
        spacing: { after: isLast ? 200 : 80 },
      }))
    })
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children,
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

export async function buildCoverLetterDocx(
  text: string,
  tailored: TailoredCV,
  job: JobSummary,
): Promise<Buffer> {
  const BRAND   = '2E3192'
  const DARK    = '111827'
  const MUTED   = '6B7280'
  const DIVIDER = 'E5E7EB'

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const paras = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const contactParts = [
    tailored.email, tailored.phone, tailored.location, tailored.linkedin,
  ].filter(Boolean)

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 52, color: DARK, font: 'Calibri' })],
      spacing: { after: 60 },
    }),
    ...(contactParts.length ? [new Paragraph({
      children: [new TextRun({ text: contactParts.join('  ·  '), size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 40 },
    })] : []),
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DIVIDER } },
      spacing: { after: 280 },
    }),
    new Paragraph({
      children: [new TextRun({ text: today, size: 19, color: MUTED, font: 'Calibri', italics: true })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Hiring Manager', bold: true, size: 20, color: DARK, font: 'Calibri' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: job.company, size: 20, color: DARK, font: 'Calibri' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: job.location ?? '', size: 19, color: MUTED, font: 'Calibri' })],
      spacing: { after: 320 },
    }),
    ...paras.map(p => new Paragraph({
      children: [new TextRun({ text: p, size: 20, color: DARK, font: 'Calibri' })],
      spacing: { after: 200 },
    })),
    new Paragraph({
      children: [new TextRun({ text: 'Sincerely,', size: 20, color: DARK, font: 'Calibri' })],
      spacing: { before: 280, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 20, color: BRAND, font: 'Calibri' })],
    }),
  ]

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children,
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}
