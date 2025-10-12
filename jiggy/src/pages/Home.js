import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../pages/PageWrapper';
import { Toggle } from '../components/Primitives';
import { DANCES } from '../utils/data';
import { useAuthedUser } from '../utils/auth';
import { DanceTile } from '../components/PlayPrimitives';
import { PrimaryButton } from '../components/Buttons';

export default function Home() {
  const user = useAuthedUser();
  const nav = useNavigate();
  const [mode, setMode] = useState('solo');
  const [selectedId, setSelectedId] = useState(2);

  useEffect(() => {
    if (!user) nav('/login');
  }, [user]);

  return (
    <Page>
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-black tracking-wide">HOW’RE YOU DANCING TODAY?</h2>
          <Toggle value={mode} onChange={setMode} />
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-lg font-black tracking-wide">PICK YOUR DANCE:</h2>
          <div className="grid grid-cols-7 gap-6">
            {DANCES.map((d) => (
              <DanceTile
                key={d.id}
                title={d.title}
                selected={d.id === selectedId}
                onClick={() => setSelectedId(d.id)}
              />)
            )}
          </div>
        </section>

        <PrimaryButton
          onClick={() => nav(`/play/${selectedId}`)}
          className="mt-10"
        >
          START
        </PrimaryButton>
    </Page>
  );
}
