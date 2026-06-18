import Checkpoint from '@/components/learn/Checkpoint';

// Renders a lesson's assigned checkpoint questions at the bottom of the lesson.
// Must sit inside LessonShell's progress provider so each Checkpoint's
// register/pass still drives lesson completion.
export default function LessonCheckpoints({ ids, locale }: { ids: string[]; locale: string }) {
  if (ids.length === 0) return null;
  return (
    <div className="lesson-checkpoints">
      {ids.map((id) => (
        <Checkpoint key={id} questionId={id} locale={locale} />
      ))}
    </div>
  );
}
