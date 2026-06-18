import { MDXRemote } from 'next-mdx-remote/rsc';
import { Tip, Caution, Note } from '@/components/learn/mdx/Callout';

// Checkpoints are no longer placed inline (SEC-04). They are assigned to a lesson
// in the CMS and rendered at the bottom of the lesson by <LessonCheckpoints>.
export default function MDXContent({ source }: { source: string }) {
  const components = { Tip, Caution, Note };
  return (
    <div className="lesson-prose">
      <MDXRemote source={source} components={components} />
    </div>
  );
}
