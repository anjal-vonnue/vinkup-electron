import { mockDayContents } from '../../api/dayOverview';
import { CURRICULUM_COURSES } from '../../constants/courses';
import { dayReferences } from './dayReferences';
import { getDayReference } from './getDayReference';

export const secondaryDisplayReferences = dayReferences.map((day) => {
  const content = getDayReference(day.id);
  const course = CURRICULUM_COURSES.find(
    (item) => item.id === day.courseId || (day.courseId === 'postgres' && item.id === 'postgresql')
  );

  if (!content || !course) {
    throw new Error(`Could not resolve secondary display reference "${day.id}".`);
  }

  return {
    ...content,
    id: day.id,
    title: mockDayContents[day.id]?.title ?? `${course.label} Day ${day.dayNumber}`,
    courseLabel: course.label,
    sections: content.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.src.startsWith('/src/content/assets/')
          ? {
              ...block,
              src: `./reference-assets/${block.src.slice('/src/content/assets/'.length)}`,
            }
          : block
      ),
    })),
  };
});
