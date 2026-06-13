'use client';

import { Stream } from '@cloudflare/stream-react';

/** Plays a Cloudflare Stream signed-URL video. `token` is a signed playback JWT. */
export default function VideoPlayer({ token }: { token: string }) {
  return (
    <div className="lesson-video">
      <Stream src={token} controls responsive />
    </div>
  );
}
