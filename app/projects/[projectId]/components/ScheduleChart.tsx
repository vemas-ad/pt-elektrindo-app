"use client";

import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export default function ScheduleChart({ rows }: { rows: any[] }) {
  // rows expected: array with description, plan_progress, actual_progress
  const data = useMemo(() => {
    // to produce a cumulative S-curve, accumulate plan & actual by row order
    let accPlan = 0;
    let accActual = 0;
    return (rows || []).map((r, i) => {
      const plan = Number(r.plan_progress || 0);
      const actual = Number(r.actual_progress || 0);
      accPlan += plan;
      accActual += actual;
      return {
        name: r.description ? (r.description.length > 12 ? r.description.slice(0, 12) + "…" : r.description) : `R${i + 1}`,
        Plan: Math.round(accPlan * 100) / 100,
        Actual: Math.round(accActual * 100) / 100,
      };
    });
  }, [rows]);

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Plan" stroke="#6b46c1" />
          <Line type="monotone" dataKey="Actual" stroke="#16a34a" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
