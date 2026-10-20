import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, 'skills');

class SkillsManager {
  constructor() {
    this.skills = this.loadAllSkills();
    this.cachedSkills = new Map(); // Cache loaded skills per conversation
  }

  /**
   * Load all skill definitions (metadata + content)
   */
  loadAllSkills() {
    const skills = {};
    
    if (!fs.existsSync(SKILLS_DIR)) {
      console.log('⚠️ Skills directory not found:', SKILLS_DIR);
      return skills;
    }

    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
    
    console.log(`📚 Loading ${files.length} skills...`);

    files.forEach(file => {
      const filePath = path.join(SKILLS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (frontmatterMatch) {
        const [, frontmatterStr, skillContent] = frontmatterMatch;
        const frontmatter = this.parseFrontmatter(frontmatterStr);
        
        const skillName = file.replace('.md', '');
        skills[skillName] = {
          ...frontmatter,
          content: skillContent.trim(),
          file,
        };

        console.log(`  ✅ Loaded skill: ${frontmatter.title} (${skillName})`);
      }
    });

    return skills;
  }

  /**
   * Simple YAML-like frontmatter parser
   */
  parseFrontmatter(str) {
    const obj = {};
    str.split('\n').forEach(line => {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Parse arrays: triggers: ["a", "b"]
        if (value.startsWith('[')) {
          obj[key] = JSON.parse(value);
        } else if (value === 'true' || value === 'false') {
          obj[key] = value === 'true';
        } else if (!isNaN(value)) {
          obj[key] = parseInt(value, 10);
        } else {
          obj[key] = value;
        }
      }
    });
    return obj;
  }

  /**
   * Find skills matching user query
   * Returns skills whose triggers match keywords in the query
   */
  findMatchingSkills(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    const matches = [];

    Object.entries(this.skills).forEach(([skillName, skill]) => {
      if (!skill.triggers) return;

      // Check if any trigger keyword appears in the message
      const matched = skill.triggers.some(trigger => 
        lowerMessage.includes(trigger.toLowerCase())
      );

      if (matched) {
        matches.push({
          name: skillName,
          ...skill,
        });
      }
    });

    return matches;
  }

  /**
   * Load skill content into context
   * This is what gets injected into the system prompt
   */
  loadSkillsForContext(userMessage) {
    const matches = this.findMatchingSkills(userMessage);

    if (matches.length === 0) {
      return ''; // No matching skills
    }

    // Sort by relevance (skills with more token cost appear first)
    matches.sort((a, b) => (b.tokens || 0) - (a.tokens || 0));

    // Take top 2 skills (avoid overloading context)
    const topSkills = matches.slice(0, 2);

    let skillContext = `\n\n📚 AVAILABLE SKILLS FOR THIS TASK:\n`;
    skillContext += `${topSkills.map(s => s.title).join(', ')}\n\n`;
    skillContext += `---\n`;

    topSkills.forEach(skill => {
      skillContext += `\n## SKILL: ${skill.title}\n`;
      skillContext += `Category: ${skill.category}\n`;
      skillContext += `\n${skill.content}\n`;
      skillContext += `\n---\n`;
    });

    return skillContext;
  }

  /**
   * Get all available skills (for /skills command)
   */
  listAllSkills() {
    const categories = {};

    Object.entries(this.skills).forEach(([name, skill]) => {
      const cat = skill.category || 'uncategorized';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({
        name,
        title: skill.title,
        tokens: skill.tokens || 0,
      });
    });

    return categories;
  }

  /**
   * Get a specific skill by name
   */
  getSkill(name) {
    return this.skills[name] || null;
  }
}

export default SkillsManager;
