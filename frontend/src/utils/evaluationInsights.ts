import type { CustomEvaluationRange } from '../types/performance'

export function evaluationInsights(range: CustomEvaluationRange) {
  const weeks = range.weekly
  const peakWeek = weeks.reduce<CustomEvaluationRange['weekly'][number] | null>((best, week) =>
    !best || week.publishedPosts > best.publishedPosts ? week : best, null)
  const measuredPosts = range.publications.filter((publication) =>
    publication.metrics && Object.values(publication.metrics).some((value) => value !== null)).length
  return {
    peakWeek: peakWeek && peakWeek.publishedPosts > 0 ? peakWeek : null,
    weeksWithoutPosts: weeks.filter((week) => week.publishedPosts === 0).length,
    weekCount: weeks.length,
    measuredPosts,
    publishedPosts: range.publications.length,
    interestedReplies: range.totals.interestedResponses,
    replies: range.totals.repliesReceived,
    weekLabels: weeks.map((week) => week.startDate),
    publishingSeries: [
      { label: 'Instagram posts', color: '#7c3aed', values: weeks.map((week) => week.instagram) },
      { label: 'LinkedIn posts', color: '#1d4ed8', values: weeks.map((week) => week.linkedin) },
    ],
    outreachSeries: [
      { label: 'Emails sent', color: '#0f766e', values: weeks.map((week) => week.emailsSent) },
      { label: 'Replies received', color: '#d97706', values: weeks.map((week) => week.repliesReceived) },
      { label: 'Meetings and demos', color: '#7c3aed', values: weeks.map((week) => week.meetings + week.demonstrations) },
    ],
  }
}
