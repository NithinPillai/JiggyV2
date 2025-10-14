import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Page from "../pages/PageWrapper";
import { Toggle } from "../components/Primitives";
import { useAuthedUser } from "../utils/auth";
import { DanceTile } from "../components/PlayPrimitives";
import { PrimaryButton } from "../components/Buttons";
import { supabase } from "../utils/supabase";

export default function Home() {
  const user = useAuthedUser();
  const nav = useNavigate();
  const [mode, setMode] = useState("solo");
  const [selectedId, setSelectedId] = useState(null);
  const [loadingThumbs, setLoadingThumbs] = useState(true);
  const [availableDances, setAvailableDances] = useState([]);
  const [listingError, setListingError] = useState(null);
  const [rawFiles, setRawFiles] = useState([]);
  const createdUrlsRef = useRef([]);

  useEffect(() => {
    if (!user) nav("/login");
  }, [user, nav]);

  useEffect(() => {
    let mounted = true;
    async function loadThumbs() {
      try {
        // Supabase returns { data, error } for list calls
        const { data: videos, error } = await supabase.storage
          .from("assets")
          .list("videos");

        if (error) {
          console.error("Error listing videos from storage", error);
          if (mounted) setListingError(error.message || JSON.stringify(error));
          return;
        }

        // save raw listing for debugging/UI
        if (mounted) setRawFiles(videos || []);

        if (!videos || videos.length === 0) return;

        for (const video of videos) {
          const { data, error: dlError } = await supabase.storage
            .from("assets")
            .download(`videos/${video.name}`);
          if (dlError) {
            console.error("Error downloading video", video.name, dlError);
            continue;
          }
          if (data) {
            const url = URL.createObjectURL(data);
            // track created urls so we can revoke them on unmount
            createdUrlsRef.current.push(url);
            // create a dance entry for this video
            const id = video.name;
            const title = video.name.replace(/\.[^/.]+$/, "");
            const dance = { id, title, thumb: url };
            if (mounted) {
              setAvailableDances((prev) => [...prev, dance]);
            } else {
              // If unmounted, immediately revoke
              URL.revokeObjectURL(url);
            }
          }
        }
      } finally {
        if (mounted) setLoadingThumbs(false);
      }
    }

    loadThumbs();
    return () => {
      mounted = false;
      // revoke any object URLs we created
      try {
        createdUrlsRef.current.forEach(URL.revokeObjectURL);
      } catch (e) {
        // ignore
      }
      createdUrlsRef.current = [];
    };
  }, []);

  return (
    <Page>
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-black tracking-wide">
          HOW’RE YOU DANCING TODAY?
        </h2>
        <Toggle value={mode} onChange={setMode} />
      </section>

      <h2 className="mb-4 text-lg font-black tracking-wide">
        PICK YOUR DANCE:
      </h2>

      {loadingThumbs ? (
        <div className="py-6">Loading thumbnails…</div>
      ) : (
        <div className="grid grid-cols-7 gap-6">
          {availableDances.map((d) => (
            <DanceTile
              key={d.id}
              title={d.title}
              selected={d.id === selectedId}
              onClick={() => setSelectedId(d.id)}
              thumb={d.thumb}
            />
          ))}
        </div>
      )}

      <PrimaryButton
        onClick={() => selectedId && nav(`/play/${selectedId}`)}
        className="mt-10"
        disabled={!selectedId}
      >
        START
      </PrimaryButton>
    </Page>
  );
}
