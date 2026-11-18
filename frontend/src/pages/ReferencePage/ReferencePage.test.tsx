import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ReferencePage from './ReferencePage';
import { getDayReference } from '../../content/data/getDayReference';

vi.mock('../../content/data/getDayReference', () => ({
  getDayReference: vi.fn(),
}));

vi.mock('../../components/Header', () => ({
  default: () => <header data-testid="header">Header</header>,
}));

vi.mock('./assets/ArrowIcon', () => ({
  default: ({ direction }: { direction: string }) => <span data-testid={`arrow-${direction}`} />,
}));

const mockedGetDayReference = vi.mocked(getDayReference);

const renderPage = (dayId = 'react-day-01') =>
  render(
    <MemoryRouter>
      <ReferencePage dayId={dayId} />
    </MemoryRouter>
  );

describe('ReferencePage', () => {
  it('renders an error when no reference content is found', () => {
    mockedGetDayReference.mockReturnValue(null);

    renderPage();

    expect(screen.getByText('No reference content found for this day.')).toBeInTheDocument();
  });

  it('renders the header and back navigation', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [],
    });

    renderPage();

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('Back to day overview')).toBeInTheDocument();
  });

  it('renders an instruction box when instruction is provided', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'prisma',
      dayNumber: 4,
      instruction: 'Use all the previous reference materials and follow the folder structure.',
      sections: [],
    });

    renderPage('prisma-day-04');

    expect(
      screen.getByText('Use all the previous reference materials and follow the folder structure.')
    ).toBeInTheDocument();
  });

  it('renders paragraph content', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'intro',
          heading: 'Introduction',
          number: 1,
          blocks: [
            {
              type: 'paragraph',
              text: 'React is used to build user interfaces.',
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByText('React is used to build user interfaces.')).toBeInTheDocument();
  });

  it('renders inline backtick code without the delimiters', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'inline-code',
          heading: 'Inline code',
          number: 1,
          blocks: [{ type: 'paragraph', text: 'Call `map()` to transform each item.' }],
        },
      ],
    });

    const { container } = renderPage();

    expect(container.querySelector('p')).toHaveTextContent('Call map() to transform each item.');
    expect(container.querySelector('p code')).toHaveTextContent('map()');
  });

  it('renders subheadings', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'components',
          heading: 'Components',
          number: 1,
          blocks: [
            {
              type: 'subheading',
              level: 3,
              text: 'Your First Component',
            },
          ],
        },
      ],
    });

    renderPage();

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Your First Component',
      })
    ).toBeInTheDocument();
  });

  it('renders code blocks with filename and language', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'code',
          heading: 'Code Example',
          number: 1,
          blocks: [
            {
              type: 'code',
              code: {
                filename: 'App.jsx',
                language: 'jsx',
                code: 'function App() { return <h1>Hello</h1>; }',
              },
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByText('App.jsx')).toBeInTheDocument();
    expect(screen.getByText('jsx')).toBeInTheDocument();
    expect(screen.getByText('App', { exact: true })).toBeInTheDocument();
  });

  it('renders unordered lists', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'list',
          heading: 'Topics',
          number: 1,
          blocks: [
            {
              type: 'list',
              ordered: false,
              items: ['Components', 'JSX', 'Props'],
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByText('Components')).toBeInTheDocument();
    expect(screen.getByText('JSX')).toBeInTheDocument();
    expect(screen.getByText('Props')).toBeInTheDocument();
  });

  it('renders ordered lists', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'steps',
          heading: 'Steps',
          number: 1,
          blocks: [
            {
              type: 'list',
              ordered: true,
              start: 1,
              items: ['Install React', 'Create a component'],
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByRole('list', { name: '' })).toHaveAttribute('start', '1');
    expect(screen.getByText('Install React')).toBeInTheDocument();
    expect(screen.getByText('Create a component')).toBeInTheDocument();
  });

  it('renders definitions', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'definitions',
          heading: 'Definitions',
          number: 1,
          blocks: [
            {
              type: 'definitions',
              items: [
                {
                  term: 'Component',
                  description: 'A reusable piece of UI.',
                },
              ],
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByText('Component')).toBeInTheDocument();
    expect(screen.getByText('A reusable piece of UI.')).toBeInTheDocument();
  });

  it('renders tables', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'table',
          heading: 'Comparison',
          number: 1,
          blocks: [
            {
              type: 'table',
              headers: ['Concept', 'Description'],
              rows: [['State', 'Component memory']],
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByRole('columnheader', { name: 'Concept' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Component memory')).toBeInTheDocument();
  });

  it('renders images', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'image',
          heading: 'Example',
          number: 1,
          blocks: [
            {
              type: 'image',
              src: '/images/example.png',
              alt: 'React example',
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByRole('img', { name: 'React example' })).toHaveAttribute(
      'src',
      '/images/example.png'
    );
  });

  it('renders info and warning callouts', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      sections: [
        {
          id: 'callouts',
          heading: 'Notes',
          number: 1,
          blocks: [
            {
              type: 'callout',
              callout: {
                variant: 'info',
                title: 'Note',
                body: 'This is useful information.',
              },
            },
            {
              type: 'callout',
              callout: {
                variant: 'warning',
                title: 'Warning',
                body: 'Be careful with this.',
              },
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('This is useful information.')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Be careful with this.')).toBeInTheDocument();
  });

  it('renders prerequisite links', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'node',
      dayNumber: 5,
      sections: [],
      prerequisiteLinks: [
        {
          label: 'Node.js Day 1 — Fundamentals',
          dayId: 'node-day-01',
        },
        {
          label: 'Node.js Day 4 — API Development',
          dayId: 'node-day-04',
        },
      ],
    });

    renderPage('node-day-05');

    expect(screen.getByText('Node.js Day 1 — Fundamentals')).toBeInTheDocument();

    expect(screen.getByText('Node.js Day 4 — API Development')).toBeInTheDocument();

    expect(screen.getAllByRole('link', { name: /View References/ })).toHaveLength(2);
  });

  it('renders the final return-to-day link', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 3,
      sections: [],
    });

    renderPage('react-day-03');

    expect(screen.getByRole('link', { name: /Return to Day 3/ })).toBeInTheDocument();
  });

  it('renders collapsible sections for configured Node topics', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'node',
      dayNumber: 2,
      sections: [
        {
          id: 'nodefspromises',
          heading: 'File System Promises',
          number: 1,
          blocks: [
            {
              type: 'subheading',
              level: 3,
              text: 'Reading Files',
            },
            {
              type: 'paragraph',
              text: 'Use promises to read files asynchronously.',
            },
          ],
        },
      ],
    });

    renderPage('node-day-02');

    expect(screen.getByText('Reading Files')).toBeInTheDocument();
    expect(screen.getByText('Use promises to read files asynchronously.')).toBeInTheDocument();

    expect(screen.getByText('Reading Files').closest('details')).toBeInTheDocument();
  });

  it('renders videos when videoAtStart is enabled', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      videoAtStart: true,
      videos: [
        {
          title: 'React Tutorial',
          embedUrl: 'https://www.youtube.com/embed/example',
        },
      ],
      sections: [],
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Video' })).toBeInTheDocument();
    const frame = screen.getByTitle('React Tutorial');
    const frameUrl = new URL(frame.getAttribute('src') ?? '');
    expect(frameUrl.origin).toBe('https://www.youtube.com');
    expect(frameUrl.pathname).toBe('/embed/example');
    expect(frameUrl.searchParams.get('origin')).toBe(window.location.origin);
    expect(frame).toHaveAttribute('referrerpolicy', 'origin');
  });

  it('renders a video after the configured topic', () => {
    mockedGetDayReference.mockReturnValue({
      courseId: 'react',
      dayNumber: 1,
      videoAfterTopicId: 'intro',
      videos: [
        {
          title: 'React Video',
          embedUrl: 'https://www.youtube.com/embed/example',
        },
      ],
      sections: [
        {
          id: 'intro',
          heading: 'Introduction',
          number: 1,
          blocks: [
            {
              type: 'paragraph',
              text: 'Introduction content',
            },
          ],
        },
      ],
    });

    renderPage();

    expect(screen.getByTitle('React Video')).toBeInTheDocument();
  });
});
