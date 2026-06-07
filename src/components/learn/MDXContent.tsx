import { MDXRemote } from 'next-mdx-remote/rsc';
import { Tip, Caution, Note } from '@/components/learn/mdx/Callout';
import Checkpoint from '@/components/learn/Checkpoint';

export default function MDXContent({ source, locale }: { source: string; locale: string }) {
  const components = {
    Tip,
    Caution,
    Note,
    Checkpoint: (props: { questionId: string }) => <Checkpoint {...props} locale={locale} />,
  };
  return (
    <div className="lesson-prose">
      <MDXRemote source={source} components={components} />
    </div>
  );
}
