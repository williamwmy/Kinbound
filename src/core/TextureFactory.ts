// Genererer placeholder-teksturer prosedyrelt slik at spillet kjører uten
// eksterne bilder. Arkitekturen lar ekte pixel art-sprites erstatte disse
// senere ved å laste dem på samme tekstur-nøkkel (spec kap. 4).
import Phaser from 'phaser';
import { Data } from './DataManager';
import type { Appearance, MonsterRole, ArmorLook, WeaponType } from '../types';

/** Hvordan våpenet vises på spillerspriten (avledet fra våpentype + element). */
export interface WeaponLook {
  type: WeaponType;
  /** farge på blad/orb (elementfarge, ellers stål) */
  color: number;
}

function shapeForRole(g: Phaser.GameObjects.Graphics, role: MonsterRole, size: number): void {
  const s = size;
  const c = s / 2;
  switch (role) {
    case 'tank':
      g.fillRoundedRect(2, 2, s - 4, s - 4, 6);
      break;
    case 'bruiser':
      g.fillRect(3, 6, s - 6, s - 8);
      g.fillTriangle(c, 0, 3, 8, s - 3, 8);
      break;
    case 'mage':
      g.fillCircle(c, c + 3, c - 3);
      g.fillTriangle(c, 0, 4, c, s - 4, c);
      break;
    case 'ranged':
      g.fillTriangle(c, 1, s - 1, c, c, s - 1);
      g.fillTriangle(c, 1, 1, c, c, s - 1);
      break;
    case 'healer':
      g.fillCircle(c, c, c - 2);
      break;
    case 'support':
      g.fillCircle(c, c, c - 2);
      break;
  }
}

export const TextureFactory = {
  /** Bygg alle datadrevne monstertegninger (begge former). */
  buildMonsterTextures(scene: Phaser.Scene): void {
    for (const mon of Data.allMonsters()) {
      const element = Data.element(mon.element);
      mon.forms.forEach((form, i) => {
        if (scene.textures.exists(form.sprite)) return;
        const size = i === 0 ? 30 : 42;
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        // kropp i elementfarge
        g.fillStyle(element.color, 1);
        shapeForRole(g, mon.role, size);
        // øyne for liv
        g.fillStyle(0x101018, 1);
        g.fillCircle(size * 0.38, size * 0.45, 2);
        g.fillCircle(size * 0.62, size * 0.45, 2);
        // helbreder-kors
        if (mon.role === 'healer') {
          g.fillStyle(0xffffff, 1);
          g.fillRect(size / 2 - 1, size * 0.25, 2, size * 0.4);
          g.fillRect(size * 0.32, size * 0.4, size * 0.36, 2);
        }
        // evolusjon: lys kant
        if (i === 1) {
          g.lineStyle(2, 0xffffff, 0.8);
          g.strokeRoundedRect(1, 1, size - 2, size - 2, 6);
        }
        g.generateTexture(form.sprite, size, size);
        g.destroy();
      });
    }
  },

  /**
   * Spillertekstur (spec kap. 8): søt chibi-helt bygget fra utseende OG utstyr.
   * Rustningens `look` avgjør hvor rustet helten ser ut - mer utstyr = mer
   * detaljert rustning, krone og horn (spec kap. 11). Datadrevet via armor.json.
   */
  buildPlayerTexture(
    scene: Phaser.Scene,
    key: string,
    look: Appearance,
    armor?: ArmorLook,
    weapon?: WeaponLook,
  ): void {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const w = 28;
    const h = 36;
    const cx = 14;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const eq: ArmorLook = armor ?? { type: 'cloth' };
    const lighten = (c: number, f: number): number => {
      const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
      const gg = Math.min(255, Math.round(((c >> 8) & 255) * f));
      const b = Math.min(255, Math.round((c & 255) * f));
      return (r << 16) | (gg << 8) | b;
    };

    // --- bein/støvler ---
    if (eq.type === 'plate') {
      g.fillStyle(eq.color ?? 0xb8bcc8, 1);
      g.fillRoundedRect(8, 29, 5, 6, 2);
      g.fillRoundedRect(15, 29, 5, 6, 2);
    } else {
      g.fillStyle(0x3a2f28, 1);
      g.fillRoundedRect(8, 30, 5, 5, 2);
      g.fillRoundedRect(15, 30, 5, 5, 2);
    }

    // --- overkropp / rustning ---
    if (eq.type === 'plate') {
      const col = eq.color ?? 0xb8bcc8;
      const trim = eq.trim ?? 0xc9a227;
      g.fillStyle(col, 1);
      g.fillRoundedRect(7, 19, 14, 12, 3);
      g.fillStyle(trim, 1);
      g.fillRect(13, 20, 2, 9); // midtstripe
      g.fillStyle(0x2fb0c0, 1);
      g.fillCircle(14, 23, 1.7); // brystgem
      g.fillStyle(lighten(col, 1.2), 1);
      g.fillCircle(7, 20, 3.3); // skulderplater
      g.fillCircle(21, 20, 3.3);
      g.fillStyle(0x4a3526, 1);
      g.fillRect(7, 29, 14, 2); // belte
      g.fillStyle(trim, 1);
      g.fillRect(13, 29, 2, 2);
    } else if (eq.type === 'light') {
      const col = eq.color ?? 0x8a5a2b;
      g.fillStyle(col, 1);
      g.fillRoundedRect(7, 20, 14, 12, 3);
      g.fillStyle(lighten(col, 0.7), 1);
      g.fillCircle(7, 21, 2.6); // myke skuldre
      g.fillCircle(21, 21, 2.6);
      g.fillStyle(0x4a3526, 1);
      g.fillRect(7, 28, 14, 2); // belte
    } else {
      g.fillStyle(look.clothColor, 1);
      g.fillRoundedRect(7, 20, 14, 12, 3);
    }

    // --- armer (hud) ---
    g.fillStyle(look.skinColor, 1);
    g.fillCircle(6, 24, 2.5);
    g.fillCircle(22, 24, 2.5);

    // --- hode ---
    g.fillStyle(look.skinColor, 1);
    g.fillCircle(cx, 11, 9);

    // --- hår (stil 0-3) ---
    g.fillStyle(look.hairColor, 1);
    const style = look.hairStyle % 4;
    if (style === 0) g.fillRoundedRect(cx - 9, 2, 18, 7, 3);
    else if (style === 1) {
      g.fillRoundedRect(cx - 9, 2, 18, 8, 3);
      g.fillRect(cx - 11, 6, 4, 11);
      g.fillRect(cx + 7, 6, 4, 11);
    } else if (style === 2) {
      g.fillTriangle(cx, -1, cx - 10, 11, cx + 10, 11);
    } else {
      g.fillRoundedRect(cx - 9, 1, 18, 6, 3);
      g.fillCircle(cx - 7, 6, 3);
      g.fillCircle(cx + 7, 6, 3);
    }

    // --- krone (plate) og horn (sjelden) ---
    if (eq.type === 'plate') {
      g.fillStyle(eq.trim ?? 0xc9a227, 1);
      g.fillRect(7, 5, 14, 2);
      g.fillStyle(0x6cd0e0, 1);
      g.fillCircle(cx, 6, 1.6);
    }
    if (eq.rare) {
      g.fillStyle(0x6a4a2a, 1);
      g.fillTriangle(8, 3, 4, -4, 11, 5);
      g.fillTriangle(20, 3, 24, -4, 17, 5);
    }

    // --- søtt ansikt: store øyne + glans + kinn + smil ---
    g.fillStyle(0x282436, 1);
    g.fillCircle(11, 12, 2.1);
    g.fillCircle(17, 12, 2.1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(10.2, 11.2, 0.9);
    g.fillCircle(16.2, 11.2, 0.9);
    g.fillStyle(0xff96a8, 0.55);
    g.fillCircle(8, 14, 1.6);
    g.fillCircle(20, 14, 1.6);
    g.fillStyle(0x9a5a66, 1);
    g.fillRect(13, 15, 2, 1);

    // --- utstyrt våpen i høyre hånd (spec kap. 10) ---
    if (weapon) {
      const steel = 0xc8ccd6;
      const gold = 0xd4af37;
      const wood = 0x7a4a24;
      const hx = 24;
      const wc = weapon.color;
      switch (weapon.type) {
        case 'sword':
          g.fillStyle(wood, 1); g.fillRect(hx - 1, 25, 3, 4); // grep
          g.fillStyle(gold, 1); g.fillRect(hx - 3, 23, 7, 2); // parérstang
          g.fillStyle(steel, 1); g.fillRect(hx, 10, 2, 13); // blad
          g.fillTriangle(hx + 1, 6, hx - 1, 11, hx + 3, 11); // spiss
          break;
        case 'axe':
          g.fillStyle(wood, 1); g.fillRect(hx, 10, 2, 18);
          g.fillStyle(steel, 1); g.fillTriangle(hx + 2, 10, hx + 9, 12, hx + 2, 18);
          break;
        case 'hammer':
          g.fillStyle(wood, 1); g.fillRect(hx, 12, 2, 16);
          g.fillStyle(steel, 1); g.fillRoundedRect(hx - 3, 8, 9, 7, 2);
          break;
        case 'spear':
          g.fillStyle(wood, 1); g.fillRect(hx, 5, 2, 25);
          g.fillStyle(steel, 1); g.fillTriangle(hx + 1, 0, hx - 1, 6, hx + 3, 6);
          break;
        case 'bow':
          g.fillStyle(wood, 1);
          g.fillRect(hx + 2, 9, 2, 14);
          g.fillTriangle(hx + 4, 9, hx - 1, 11, hx + 4, 15);
          g.fillTriangle(hx + 4, 23, hx - 1, 21, hx + 4, 17);
          g.lineStyle(1, 0xeeeeee, 0.8); g.beginPath(); g.moveTo(hx, 9); g.lineTo(hx, 23); g.strokePath();
          break;
        case 'staff':
          g.fillStyle(wood, 1); g.fillRect(hx, 9, 2, 21);
          g.fillStyle(wc, 1); g.fillCircle(hx + 1, 6, 3);
          g.fillStyle(0xffffff, 0.6); g.fillCircle(hx, 5, 1);
          break;
      }
      // elementglød på egg/blad
      if (weapon.type !== 'staff' && wc !== steel) {
        g.fillStyle(wc, 0.45);
        g.fillRect(hx, 6, 2, 17);
      }
    }

    g.generateTexture(key, w, h);
    g.destroy();
  },

  /** Enkle NPC- og hjelpeteksturer. */
  buildMiscTextures(scene: Phaser.Scene): void {
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void, w: number, h: number) => {
      if (scene.textures.exists(key)) return;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    const npc = (key: string, color: number) =>
      make(
        key,
        (g) => {
          g.fillStyle(color, 1);
          g.fillRoundedRect(3, 14, 22, 22, 4);
          g.fillStyle(0xf0c8a0, 1);
          g.fillCircle(14, 10, 8);
          g.fillStyle(0x101018, 1);
          g.fillCircle(11, 10, 1.5);
          g.fillCircle(17, 10, 1.5);
        },
        28,
        36,
      );
    npc('npc_shop', 0xc9a227);
    npc('npc_healer', 0x4fd1c5);
    npc('npc_smith', 0x9b6a3f);
    npc('npc_elder', 0xb0a0d0);
    npc('npc_villager', 0x8fae6a);

    // prosjektil
    make(
      'projectile',
      (g) => {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(5, 5, 5);
      },
      10,
      10,
    );

    // angreps-slag (lys halvbue)
    make(
      'slash',
      (g) => {
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(16, 16, 16);
      },
      32,
      32,
    );

    // kiste
    make(
      'chest',
      (g) => {
        g.fillStyle(0x7a4a1e, 1);
        g.fillRoundedRect(2, 8, 24, 18, 3);
        g.fillStyle(0xc9a227, 1);
        g.fillRect(2, 14, 24, 4);
        g.fillRect(12, 12, 4, 8);
      },
      28,
      28,
    );

    // hindring / blokk (generisk fallback)
    make(
      'obstacle',
      (g) => {
        g.fillStyle(0x555560, 1);
        g.fillRoundedRect(0, 0, 40, 40, 6);
        g.lineStyle(2, 0x2a2a30, 1);
        g.strokeRoundedRect(1, 1, 38, 38, 6);
      },
      40,
      40,
    );

    // Hindringene tegnes som det de ER, i STOR størrelse så de leser seg som ekte
    // barrierer i proporsjon med helten (~45x58px), uten tekst (spec kap. 4, 21).
    // Stor steinhaug som sperrer veien -> knuse stein.
    make('obs_smash_rocks', (g) => {
      g.fillStyle(0x6b6b73, 1);
      g.fillCircle(22, 44, 21); g.fillCircle(48, 46, 18); g.fillCircle(35, 22, 19);
      g.fillStyle(0x7a7a82, 1); g.fillCircle(30, 30, 7); g.fillCircle(52, 40, 6); // høylys
      g.fillStyle(0x55555c, 1); g.fillCircle(16, 52, 9); g.fillCircle(46, 54, 8); // skygge
      g.lineStyle(2.5, 0x3a3a40, 1);
      g.strokeCircle(22, 44, 21); g.strokeCircle(48, 46, 18); g.strokeCircle(35, 22, 19);
      g.lineStyle(1.5, 0x3a3a40, 0.8);
      g.beginPath(); g.moveTo(35, 8); g.lineTo(30, 34); g.strokePath();
      g.beginPath(); g.moveTo(48, 32); g.lineTo(54, 52); g.strokePath();
    }, 70, 64);

    // Høy klippe med gress på toppen (noe man ikke rekker) + spirende lianer -> dyrke lianer.
    make('obs_grow_vines', (g) => {
      g.fillStyle(0x6a5d4a, 1); g.fillRect(5, 20, 50, 56);
      g.fillStyle(0x7d6f58, 1); g.fillRect(5, 20, 50, 8); // klippe-lippe
      g.fillStyle(0x5a4e3d, 1); g.fillRect(18, 30, 4, 46); g.fillRect(40, 28, 4, 48); // sprekker
      g.fillStyle(0x4a9e4a, 1); g.fillRect(5, 11, 50, 11); // gress på den utilgjengelige toppen
      g.fillStyle(0x3e7e3e, 1); g.fillRect(5, 11, 50, 3);
      g.lineStyle(3.5, 0x3e8e3e, 1); // lianer som klatrer
      g.beginPath(); g.moveTo(15, 76); g.lineTo(18, 48); g.lineTo(12, 24); g.strokePath();
      g.beginPath(); g.moveTo(46, 76); g.lineTo(41, 50); g.lineTo(47, 26); g.strokePath();
      g.fillStyle(0x5bbf5b, 1); g.fillCircle(12, 24, 4); g.fillCircle(47, 26, 4); g.fillCircle(17, 50, 3.5);
    }, 60, 78);

    // Bred ØDELAGT bro med rekkverk og et gap i midten -> bygge broer.
    make('obs_build_bridges', (g) => {
      g.fillStyle(0x14161c, 1); g.fillRect(0, 22, 92, 26); // kløft/gap
      g.fillStyle(0x8a5a2b, 1); g.fillRect(0, 20, 32, 30); g.fillRect(60, 20, 32, 30); // plattformer
      g.fillStyle(0x6e4620, 1); // planke-skjøter
      for (let i = 3; i < 32; i += 6) g.fillRect(i, 20, 2.5, 30);
      for (let i = 63; i < 92; i += 6) g.fillRect(i, 20, 2.5, 30);
      g.fillStyle(0x9a6a3b, 1); g.fillRect(0, 14, 32, 6); g.fillRect(60, 14, 32, 6); // rekkverk
      g.fillRect(2, 6, 4, 14); g.fillRect(27, 6, 4, 14); g.fillRect(61, 6, 4, 14); g.fillRect(86, 6, 4, 14); // stolper
      g.lineStyle(2.5, 0xcfc0a0, 1); // frynsete tau ut i gapet
      g.beginPath(); g.moveTo(32, 26); g.lineTo(44, 32); g.strokePath();
      g.beginPath(); g.moveTo(60, 26); g.lineTo(48, 32); g.strokePath();
    }, 92, 56);

    // Stor sovende maskin med tannhjul og slukket lys -> aktivere maskiner.
    make('obs_activate_machines', (g) => {
      g.fillStyle(0x4a4e58, 1); g.fillRoundedRect(6, 14, 56, 50, 6);
      g.lineStyle(3, 0x2a2e36, 1); g.strokeRoundedRect(6, 14, 56, 50, 6);
      g.fillStyle(0x6a6e78, 1); g.fillCircle(28, 38, 14); g.fillCircle(50, 52, 10);
      g.fillStyle(0x3a3e46, 1); g.fillCircle(28, 38, 5); g.fillCircle(50, 52, 4);
      g.lineStyle(2, 0x3a3e46, 1); g.strokeCircle(28, 38, 14); g.strokeCircle(50, 52, 10);
      g.fillStyle(0x7a2a2a, 1); g.fillCircle(52, 22, 5); // slukket (rød) indikator
    }, 68, 70);

    // Bred vannkulp som sperrer veien -> hoppe over vann.
    make('obs_jump_water', (g) => {
      g.fillStyle(0x3a6ea5, 1); g.fillRoundedRect(3, 10, 78, 44, 14);
      g.fillStyle(0x4f86c0, 1); g.fillRoundedRect(9, 15, 66, 16, 11);
      g.lineStyle(2.5, 0xbfe0f5, 0.7);
      g.beginPath(); g.moveTo(16, 40); g.lineTo(36, 40); g.strokePath();
      g.beginPath(); g.moveTo(46, 46); g.lineTo(68, 46); g.strokePath();
    }, 84, 60);

    // Høy slukket fakkel/ildkar -> tenne fakler.
    make('obs_light_torches', (g) => {
      g.fillStyle(0x4a4038, 1); g.fillRect(22, 34, 10, 40); // stang
      g.fillStyle(0x3a322c, 1); g.fillRect(12, 72, 30, 6); // fot
      g.fillStyle(0x5a4a3a, 1); g.fillRoundedRect(11, 18, 32, 20, 6); // ildkar
      g.fillStyle(0x201c18, 1); g.fillEllipse(27, 24, 28, 12); // mørkt, uantent
      g.fillStyle(0x6a6a72, 1); g.fillCircle(21, 24, 2.4); g.fillCircle(33, 25, 2); // kalde glør
    }, 54, 80);

    // Stor tett mørke-sky som skjuler veien -> lyse opp mørket.
    make('obs_illuminate_dark', (g) => {
      g.fillStyle(0x1a1626, 1); g.fillCircle(24, 40, 20); g.fillCircle(48, 36, 21); g.fillCircle(36, 50, 18);
      g.fillStyle(0x2a2440, 0.9); g.fillCircle(32, 32, 14);
      g.fillStyle(0x6a5a9a, 1); g.fillCircle(26, 38, 2.4); g.fillCircle(48, 36, 2.4);
    }, 72, 66);

    // Høy sovende runestein (matt, ikke glødende) -> lade opp runer.
    make('obs_charge_runes', (g) => {
      g.fillStyle(0x5a5560, 1); g.fillRoundedRect(10, 10, 34, 64, 7);
      g.lineStyle(3, 0x3a3540, 1); g.strokeRoundedRect(10, 10, 34, 64, 7);
      g.lineStyle(3.5, 0x8a84a0, 1); g.strokeCircle(27, 40, 11);
      g.beginPath(); g.moveTo(27, 26); g.lineTo(27, 54); g.strokePath();
      g.beginPath(); g.moveTo(16, 40); g.lineTo(38, 40); g.strokePath();
    }, 54, 80);

    // Bred åpent vann med is som begynner å danne seg -> fryse vann.
    make('obs_freeze_water', (g) => {
      g.fillStyle(0x3a6ea5, 1); g.fillRoundedRect(3, 10, 78, 44, 14);
      g.fillStyle(0x4f86c0, 1); g.fillRoundedRect(9, 15, 66, 14, 11);
      g.fillStyle(0xcfeeff, 0.85); // isflak i hjørnene
      g.fillTriangle(3, 10, 28, 11, 4, 30);
      g.fillTriangle(81, 54, 54, 52, 80, 34);
      g.fillStyle(0xeaf7ff, 1); // iskrystaller
      g.fillCircle(30, 26, 5); g.fillCircle(54, 40, 5); g.fillCircle(42, 18, 3.5);
      g.lineStyle(2.5, 0xbfe0f5, 0.7); g.beginPath(); g.moveTo(18, 44); g.lineTo(34, 44); g.strokePath();
    }, 84, 60);

    // Stor mistenkelig sprukket mur -> avsløre skjulte vegger.
    make('obs_reveal_walls', (g) => {
      g.fillStyle(0x6a5d52, 1); g.fillRect(3, 6, 74, 60);
      g.lineStyle(2.5, 0x4a3f37, 1);
      for (let yy = 18; yy < 66; yy += 13) { g.beginPath(); g.moveTo(3, yy); g.lineTo(77, yy); g.strokePath(); }
      g.beginPath(); g.moveTo(27, 6); g.lineTo(27, 18); g.strokePath();
      g.beginPath(); g.moveTo(52, 6); g.lineTo(52, 18); g.strokePath();
      g.beginPath(); g.moveTo(14, 18); g.lineTo(14, 31); g.strokePath();
      g.beginPath(); g.moveTo(40, 18); g.lineTo(40, 31); g.strokePath();
      g.beginPath(); g.moveTo(64, 18); g.lineTo(64, 31); g.strokePath();
      g.lineStyle(3, 0x2a2420, 1); // mistenkelig sprekk
      g.beginPath(); g.moveTo(44, 8); g.lineTo(36, 30); g.lineTo(46, 44); g.lineTo(38, 64); g.strokePath();
    }, 80, 70);

    // lite hjerte (vennskaps-effekt ved rekruttering, spec kap. 14, 36)
    // frodig hekk-flis (skogslabyrint, spec kap. 25) - tilbar busk-tekstur
    make('hedge_tile', (g) => {
      g.fillStyle(0x244a1e, 1); g.fillRect(0, 0, 32, 32); // mørk base
      // overlappende løvverk-klumper i to grønntoner (dekker hele flisen, tilbar)
      g.fillStyle(0x336128, 1);
      g.fillCircle(7, 7, 9); g.fillCircle(24, 9, 9); g.fillCircle(14, 22, 9); g.fillCircle(29, 26, 8); g.fillCircle(2, 26, 8);
      g.fillStyle(0x3f7531, 1); // høylys-topper
      g.fillCircle(8, 6, 4); g.fillCircle(23, 8, 4); g.fillCircle(15, 20, 4); g.fillCircle(28, 24, 3);
      g.fillStyle(0x18330f, 0.55); // skygge-lommer
      g.fillCircle(18, 15, 4); g.fillCircle(4, 16, 3.5);
    }, 32, 32);

    make('heart', (g) => {
      g.fillStyle(0xff6b8a, 1);
      g.fillCircle(5, 6, 4.2); g.fillCircle(13, 6, 4.2);
      g.fillTriangle(1, 7.5, 17, 7.5, 9, 16);
      g.fillStyle(0xffc0d0, 0.95); g.fillCircle(5, 5, 1.6); // glanspunkt
    }, 18, 17);

    // dyttbar stein + trykkplate (blocks-gåter, spec kap. 26)
    make('push_block', (g) => {
      g.fillStyle(0x5d5668, 1); // rund kampestein
      g.fillCircle(19, 19, 17);
      g.fillStyle(0x726a80, 1); // topplys
      g.fillCircle(15, 14, 10);
      g.fillStyle(0x453f52, 0.9); // bunn-skygge
      g.fillCircle(23, 27, 8);
      g.lineStyle(2, 0x36313f, 1);
      g.strokeCircle(19, 19, 17);
      // små sprekker så den leses som "stein som kan flyttes"
      g.lineStyle(1.5, 0x36313f, 0.8);
      g.beginPath(); g.moveTo(10, 22); g.lineTo(16, 19); g.strokePath();
      g.beginPath(); g.moveTo(24, 10); g.lineTo(27, 16); g.strokePath();
    }, 38, 38);
    make('pressure_plate', (g) => {
      g.fillStyle(0x2a2633, 1); // nedsenket ramme
      g.fillRoundedRect(1, 1, 34, 34, 6);
      g.fillStyle(0x4a4458, 1); // plate
      g.fillRoundedRect(5, 5, 26, 26, 5);
      g.lineStyle(2, 0xffe066, 0.8); // gyllen markering = "legg noe her"
      g.strokeRoundedRect(8, 8, 20, 20, 4);
    }, 36, 36);

    // mynt (drops fra fiender - belønningsløkka i kamp)
    make('coin', (g) => {
      g.fillStyle(0xc9920e, 1); g.fillCircle(7, 7, 6.5); // mørk kant
      g.fillStyle(0xffd23e, 1); g.fillCircle(7, 7, 5.2);
      g.fillStyle(0xffec9a, 1); g.fillCircle(5, 5, 1.8); // glans
      g.lineStyle(1.5, 0xc9920e, 0.9); g.strokeCircle(7, 7, 3);
    }, 14, 14);

    // rune-bryter (puslespill, spec kap. 26) - rund stenplate med rune
    make(
      'rune',
      (g) => {
        g.fillStyle(0x3a3550, 1); // steinplate
        g.fillCircle(16, 16, 15);
        g.lineStyle(2, 0x6a6480, 1);
        g.strokeCircle(16, 16, 15);
        g.lineStyle(2.5, 0x8a84a8, 1); // inaktiv rune
        g.strokeCircle(16, 16, 7);
        g.beginPath();
        g.moveTo(16, 6); g.lineTo(16, 26); g.strokePath();
      },
      32,
      32,
    );

    // port/sperre (åpnes når puslespill løses)
    make(
      'gate',
      (g) => {
        g.fillStyle(0x4a4458, 1);
        g.fillRect(0, 0, 40, 24);
        g.lineStyle(2, 0x2a2636, 1);
        for (let i = 4; i < 40; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 24); g.strokePath(); }
        g.strokeRect(1, 1, 38, 22);
      },
      40,
      24,
    );

    // soneutgang (portal)
    // Glødende portal-bue så det er tydelig at det er en overgang.
    make(
      'exit',
      (g) => {
        g.fillStyle(0x4a4458, 1); // steinramme
        g.fillRoundedRect(2, 2, 40, 60, 18);
        g.fillStyle(0x2a2636, 1);
        g.fillRoundedRect(6, 6, 32, 52, 14);
        g.fillStyle(0x5aa0e0, 0.55); // glød
        g.fillRoundedRect(8, 9, 28, 46, 13);
        g.fillStyle(0x8fd0ff, 0.7);
        g.fillRoundedRect(12, 14, 20, 36, 10);
        g.fillStyle(0xeaf7ff, 0.6); // lys kjerne
        g.fillRoundedRect(17, 22, 10, 20, 6);
        g.fillStyle(0xffffff, 0.95); // gnister
        g.fillCircle(22, 16, 1.6);
        g.fillCircle(18, 42, 1.2);
        g.fillCircle(28, 36, 1.2);
        g.fillStyle(0xc9a227, 1); // gull-topp på buen
        g.fillCircle(22, 4, 2.4);
      },
      44,
      64,
    );

    // huleinngang (dungeon-portal): mørk åpning i en steinhaug (spec kap. 26)
    make(
      'cave',
      (g) => {
        // steinhaug rundt åpningen
        g.fillStyle(0x5a5048, 1); g.fillRoundedRect(2, 10, 60, 46, 16);
        g.fillStyle(0x6b6258, 1); g.fillRoundedRect(7, 9, 50, 14, 12); // lysere topp
        g.fillStyle(0x4a423a, 1); g.fillRect(2, 46, 60, 12); // mørkere base
        // selve huleåpningen - mørk bue
        g.fillStyle(0x141016, 1); g.fillEllipse(32, 36, 36, 40);
        g.fillStyle(0x000000, 1); g.fillEllipse(32, 40, 26, 30); // dypt mørke
        // hakkete kanter / stalaktitter i munningen
        g.fillStyle(0x6b6258, 1);
        g.fillTriangle(18, 20, 26, 20, 22, 30);
        g.fillTriangle(40, 20, 48, 20, 44, 31);
        g.fillTriangle(14, 26, 20, 26, 17, 34);
        // løse steiner ved foten
        g.fillStyle(0x4a423a, 1); g.fillCircle(10, 54, 5); g.fillCircle(54, 54, 5); g.fillCircle(46, 56, 3.5);
      },
      64,
      60,
    );

    // 1x1 hvit piksel (for fleksible fyll)
    make(
      'pixel',
      (g) => {
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 1, 1);
      },
      1,
      1,
    );

    // bakkeflis med subtilt rutemønster
    make(
      'ground',
      (g) => {
        g.fillStyle(0xffffff, 0.04);
        g.fillRect(0, 0, 64, 64);
        g.lineStyle(1, 0x000000, 0.06);
        g.strokeRect(0, 0, 64, 64);
      },
      64,
      64,
    );
  },

  /** Dekorasjoner som gir hver sone unik grafisk identitet (spec kap. 4). */
  buildEnvironmentTextures(scene: Phaser.Scene): void {
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void, w: number, h: number) => {
      if (scene.textures.exists(key)) return;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    make('deco_tree', (g) => {
      g.fillStyle(0x5a3a1e, 1).fillRect(20, 36, 8, 20);
      g.fillStyle(0x2f7d3a, 1).fillCircle(24, 24, 20);
      g.fillStyle(0x3f9d4a, 1).fillCircle(16, 20, 12);
      g.fillStyle(0x3f9d4a, 1).fillCircle(32, 22, 12);
    }, 48, 60);

    make('deco_pine', (g) => {
      g.fillStyle(0x4a3018, 1).fillRect(20, 44, 6, 14);
      g.fillStyle(0x2a6d4a, 1).fillTriangle(24, 4, 6, 34, 42, 34);
      g.fillStyle(0x357d56, 1).fillTriangle(24, 18, 10, 48, 38, 48);
      g.fillStyle(0xffffff, 0.7).fillTriangle(24, 8, 16, 22, 32, 22);
    }, 48, 60);

    make('deco_rock', (g) => {
      g.fillStyle(0x6e6e78, 1).fillRoundedRect(2, 10, 36, 26, 8);
      g.fillStyle(0x82828e, 1).fillRoundedRect(8, 6, 18, 14, 6);
    }, 40, 40);

    make('deco_bush', (g) => {
      g.fillStyle(0x357d3a, 1).fillCircle(10, 18, 9);
      g.fillStyle(0x3f9d4a, 1).fillCircle(20, 16, 11);
      g.fillStyle(0x357d3a, 1).fillCircle(30, 18, 9);
    }, 40, 28);

    make('deco_flower', (g) => {
      g.fillStyle(0x3f9d4a, 1).fillRect(9, 10, 2, 12);
      g.fillStyle(0xff6f9c, 1).fillCircle(10, 8, 5);
      g.fillStyle(0xffd479, 1).fillCircle(10, 8, 2);
    }, 20, 24);

    make('deco_reed', (g) => {
      g.fillStyle(0x6a8f3a, 1);
      g.fillRect(6, 6, 3, 32);
      g.fillRect(14, 2, 3, 36);
      g.fillRect(22, 8, 3, 30);
      g.fillStyle(0x8a6a2a, 1).fillCircle(15, 4, 3);
    }, 30, 40);

    make('deco_lava', (g) => {
      g.fillStyle(0x5a1a0e, 1).fillRoundedRect(0, 6, 44, 24, 10);
      g.fillStyle(0xff6a1a, 1).fillRoundedRect(6, 12, 32, 12, 6);
      g.fillStyle(0xffd24a, 1).fillCircle(20, 18, 4);
    }, 44, 36);

    make('deco_crystal', (g) => {
      g.fillStyle(0x6cc0ff, 0.9).fillTriangle(14, 0, 4, 30, 24, 30);
      g.fillStyle(0xaee0ff, 0.9).fillTriangle(14, 6, 9, 30, 19, 30);
    }, 28, 32);

    make('deco_pillar', (g) => {
      g.fillStyle(0x9a8f70, 1).fillRect(6, 4, 20, 48);
      g.fillStyle(0xb6ab8a, 1).fillRect(2, 0, 28, 8);
      g.fillStyle(0x7a6f55, 1).fillRect(2, 48, 28, 8);
    }, 32, 56);

    make('deco_banner', (g) => {
      g.fillStyle(0x6a4a8a, 1).fillRect(8, 4, 16, 34);
      g.fillStyle(0xc9a227, 1).fillCircle(16, 18, 5);
      g.fillStyle(0x4a3060, 1).fillTriangle(8, 38, 24, 38, 16, 48);
    }, 32, 52);
  },

  /** Lag en vignett-tekstur (radial gradient) for moderne lyssetting (spec kap. 4). */
  buildVignette(scene: Phaser.Scene, key: string, w: number, h: number): void {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.25, cx, cy, Math.max(w, h) * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  },

  /**
   * Bygg en flislagt bakketekstur per sonetema (`ground_<theme>`) - flisvariasjon
   * + temadetaljer (gress/stein/gjørme/glør/snø/sømmer) gir hver sone egen
   * grafisk identitet (spec kap. 3-4). Tiles sømløst over hele sonen.
   */
  buildGroundTextures(scene: Phaser.Scene): void {
    for (const [theme, cfg] of Object.entries(GROUND_THEMES)) {
      const key = `ground_${theme}`;
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const cell = 16;
      for (let cy = 0; cy < 4; cy++)
        for (let cx = 0; cx < 4; cx++) {
          const h = (cx * 7 + cy * 13) % 3;
          g.fillStyle(h === 0 ? cfg.dark : h === 2 ? cfg.light : cfg.base, 1);
          g.fillRect(cx * cell, cy * cell, cell, cell);
        }
      const pts: Array<[number, number]> = [
        [10, 12], [28, 40], [48, 20], [20, 52], [54, 50], [38, 8], [6, 34], [44, 33],
      ];
      if (cfg.detail === 'grass') {
        g.fillStyle(cfg.dcol, 1);
        for (const [x, y] of pts) { g.fillRect(x, y, 1, 3); g.fillRect(x + 2, y + 1, 1, 2); }
      } else if (cfg.detail === 'pebble') {
        for (const [x, y] of pts) { g.fillStyle(cfg.dcol, 1); g.fillCircle(x, y, 1.3); }
      } else if (cfg.detail === 'mud') {
        for (const [x, y] of pts) { g.fillStyle(cfg.dcol, 1); g.fillCircle(x, y, 2.2); }
      } else if (cfg.detail === 'ember') {
        for (const [x, y] of pts) { g.fillStyle(cfg.dcol, 1); g.fillCircle(x, y, 1); }
      } else if (cfg.detail === 'snow') {
        g.fillStyle(cfg.dcol, 1);
        for (const [x, y] of pts) { g.fillRect(x, y, 1, 1); g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
      } else if (cfg.detail === 'seam') {
        g.fillStyle(cfg.dcol, 1);
        for (let i = 0; i <= 64; i += 32) { g.fillRect(i === 64 ? 63 : i, 0, 1, 64); g.fillRect(0, i === 64 ? 63 : i, 64, 1); }
      }
      g.generateTexture(key, 64, 64);
      g.destroy();
    }
  },
};

// Bakke-paletter per sonetema.
const GROUND_THEMES: Record<
  string,
  { base: number; dark: number; light: number; detail: string; dcol: number }
> = {
  village: { base: 0x6f9850, dark: 0x638c46, light: 0x7da45c, detail: 'grass', dcol: 0x547a3e },
  forest: { base: 0x4f7a44, dark: 0x456e3c, light: 0x59864c, detail: 'grass', dcol: 0x3c6234 },
  mountain: { base: 0x7c7a82, dark: 0x6e6c74, light: 0x8a8890, detail: 'pebble', dcol: 0x969498 },
  swamp: { base: 0x5b6b44, dark: 0x51603c, light: 0x66774e, detail: 'mud', dcol: 0x4a5436 },
  volcano: { base: 0x4a3a36, dark: 0x40312e, light: 0x564440, detail: 'ember', dcol: 0xd86a2a },
  snow: { base: 0xd6e0ea, dark: 0xc8d4e0, light: 0xe6eef6, detail: 'snow', dcol: 0xffffff },
  ruins: { base: 0x8a7f63, dark: 0x7e735a, light: 0x968b6e, detail: 'pebble', dcol: 0xa89c7c },
  castle: { base: 0x4e4a5a, dark: 0x444050, light: 0x585466, detail: 'seam', dcol: 0x36323f },
  // mørkt steingulv for huler/dungeons (spec kap. 26)
  cave: { base: 0x2c2832, dark: 0x252029, light: 0x39343f, detail: 'pebble', dcol: 0x423d49 },
};

// Hvilke dekorasjoner som hører til hvert sonetema.
export const THEME_DECOR: Record<string, string[]> = {
  village: ['deco_tree', 'deco_bush', 'deco_flower'],
  forest: ['deco_tree', 'deco_bush', 'deco_flower'],
  mountain: ['deco_rock', 'deco_rock', 'deco_pine'],
  swamp: ['deco_reed', 'deco_bush', 'deco_reed'],
  volcano: ['deco_lava', 'deco_rock'],
  snow: ['deco_pine', 'deco_rock'],
  ruins: ['deco_pillar', 'deco_crystal'],
  castle: ['deco_pillar', 'deco_banner'],
};
