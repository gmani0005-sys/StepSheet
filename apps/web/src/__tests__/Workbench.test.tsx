import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TopBar } from '../components/layout/TopBar';

describe('StepSheet Workbench TopBar', () => {
  it('renders brand name and actions', () => {
    render(<TopBar />);
    expect(screen.getByText('StepSheet')).toBeDefined();
    expect(screen.getByText('Workbench')).toBeDefined();
  });
});
