import "#reflect-metadata";
import { assert, assertEquals } from "#assert";
import { ApiProperty } from "#danet/swagger/decorators";
import {
  Endpoint,
  EndpointController,
  endpointModule,
} from "@foundation/domain/business/endpoint-decorator/mod.ts";
import { bootstrapServer } from "@foundation/domain/coordinators/bootstrap-server/mod.ts";

// Opt-in: drives the real emulator UI in headless chromium. Needs Playwright + a
// browser provisioned (`deno run -A npm:playwright install chromium`). Run with:
//   KEEP_BROWSER=1 deno test -A --unstable-raw-imports .../emulator-ui/browser.test.ts
const enabled = Deno.env.get("KEEP_BROWSER") === "1";

class CreateDto {
  @ApiProperty()
  name!: string;
}
class RefDto {
  @ApiProperty()
  id!: string;
}
class ThingDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
}

@EndpointController("http")
class HttpController {
  @Endpoint({ path: "create", input: CreateDto, output: ThingDto, order: 1 })
  create(body: CreateDto): ThingDto {
    return { id: "thing-7", name: body.name ?? "anon" };
  }
  @Endpoint({
    path: "fetch",
    input: RefDto,
    output: ThingDto,
    order: 2,
    dependsOn: "create",
    bind: { id: "create.id" },
  })
  fetch(body: RefDto): ThingDto {
    if (!body?.id) throw new Error("missing id");
    return { id: body.id, name: "fetched" };
  }
}

const EmuModule = endpointModule("Emu", [HttpController]);

Deno.test({
  name:
    "emulator — progressive unlock + autofill + checkmarks (headless chromium)",
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const port = 9611;
    const server = await bootstrapServer("emu", EmuModule, { port });
    await server.listen();
    const { chromium } = await import("#playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/docs/emu`);

      const emulateButtons = page.locator("button.emulate");
      // Initially: step 1 enabled, step 2 locked.
      assertEquals(await emulateButtons.nth(0).isDisabled(), false);
      assertEquals(await emulateButtons.nth(1).isDisabled(), true);

      // Emulate step 1 → checkmark, step 2 unlocks. Its body holds the {{reference}} (stable,
      // never rewritten); the "will send" preview resolves it to the captured id.
      await emulateButtons.nth(0).click();
      await page.locator("li .dot.ok").first().waitFor();
      assertEquals(await emulateButtons.nth(1).isDisabled(), false);
      const step2Body = await page.locator("li").nth(1).locator("textarea")
        .inputValue();
      assert(
        step2Body.includes("{{create.id}}"),
        `step 2 body should reference create.id: ${step2Body}`,
      );
      const step2Resolved = await page.locator("li").nth(1).locator(
        ".resolved",
      ).textContent();
      assert(
        step2Resolved?.includes("thing-7"),
        `step 2 resolved request not filled from the captured id: ${step2Resolved}`,
      );

      // Run all → both steps green.
      await page.locator("#runall").click();
      // String predicate runs in the browser; avoids needing the DOM lib in Deno's typecheck.
      await page.waitForFunction(
        "document.querySelectorAll('li .dot.ok').length === 2",
        { timeout: 5000 },
      );

      // The curl is paste-ready: absolute URL, single-quoted, compact resolved body.
      const curl = await page.locator("li").nth(1).locator(".curl")
        .textContent();
      assert(
        curl?.includes(`curl -X POST 'http://localhost:${port}/http/fetch'`),
        `curl is not absolute + shell-quoted: ${curl}`,
      );
      assert(
        curl?.includes(`-d '{"id":"thing-7"}'`),
        `curl body is not the compact resolved request: ${curl}`,
      );

      // The session survives a reload: statuses, captured outputs, and the restored note.
      await page.reload();
      await page.waitForFunction(
        "document.querySelectorAll('li .dot.ok').length === 2",
        { timeout: 5000 },
      );
      assertEquals(await page.locator("#session-note").isVisible(), true);
      const varsText = await page.locator("#vars").textContent();
      assert(
        varsText?.includes("create.id") && varsText?.includes("thing-7"),
        `variables panel not restored: ${varsText}`,
      );

      // A failing step stops run-all with an explanatory banner (statuses were cleared by the
      // all-green re-run path, so step 1 really re-fires — with a body the server rejects).
      await page.locator("li").nth(0).locator(".path").click();
      await page.locator("li").nth(0).locator("textarea").fill("not json {{");
      await page.locator("#runall").click();
      await page.locator("#banner.err").waitFor({ timeout: 5000 });
      const bannerText = await page.locator("#banner").textContent();
      assert(
        bannerText?.includes("Stopped at step 1") &&
          bannerText?.includes("invalid JSON"),
        `failure banner missing or unclear: ${bannerText}`,
      );
    } finally {
      await browser.close();
      await server.stop();
    }
  },
});

// ── flows: XOR branches, the OR-join, and the flow selector ──────────────────

class TicketDto {
  @ApiProperty()
  ticketId!: string;
}
class PaymentDto {
  @ApiProperty()
  paymentId!: string;
}
class DoneDto {
  @ApiProperty()
  done!: boolean;
}

@EndpointController("pay")
class PayController {
  @Endpoint({ path: "start", input: CreateDto, output: TicketDto, order: 1 })
  start(_body: CreateDto): TicketDto {
    return { ticketId: "t-1" };
  }
  @Endpoint({
    path: "card",
    input: TicketDto,
    output: PaymentDto,
    order: 2,
    dependsOn: "start",
    bind: { ticketId: "start.ticketId" },
    flows: "card",
  })
  payCard(body: TicketDto): PaymentDto {
    return { paymentId: `card-${body.ticketId}` };
  }
  @Endpoint({
    path: "cash",
    input: TicketDto,
    output: PaymentDto,
    order: 2,
    dependsOn: "start",
    bind: { ticketId: "start.ticketId" },
    flows: "cash",
  })
  payCash(body: TicketDto): PaymentDto {
    return { paymentId: `cash-${body.ticketId}` };
  }
  @Endpoint({
    path: "fulfill",
    input: PaymentDto,
    output: DoneDto,
    order: 3,
    dependsOn: ["payCard", "payCash"],
    bind: { paymentId: ["payCard.paymentId", "payCash.paymentId"] },
  })
  fulfill(body: PaymentDto): DoneDto {
    if (!body?.paymentId) throw new Error("missing paymentId");
    return { done: true };
  }
}

const PayModule = endpointModule("Pay", [PayController]);

Deno.test({
  name:
    "emulator — flow selector walks one branch; the OR-join unlocks (headless chromium)",
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const port = 9613;
    const server = await bootstrapServer("flows", PayModule, { port });
    await server.listen();
    const { chromium } = await import("#playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/docs/pay`);

      // The selector lists All + both flows; branch steps carry flow chips in the All view.
      assertEquals(await page.locator("#flows").isVisible(), true);
      assertEquals(await page.locator("#flows button").count(), 3);

      // Pick the card flow: the cash step disappears, 3 steps remain.
      await page.locator('#flows button[data-flow="card"]').click();
      await page.waitForFunction(
        "document.querySelectorAll('li:not(.offflow)').length === 3",
        { timeout: 5000 },
      );

      // Run all walks start → payCard → fulfill; the join unlocks via the card branch alone,
      // and its OR-bind resolves to the card payment.
      await page.locator("#runall").click();
      await page.waitForFunction(
        "document.querySelectorAll('li:not(.offflow) .dot.ok').length === 3",
        { timeout: 10000 },
      );
      const banner = await page.locator("#banner").textContent();
      assert(
        banner?.includes("All 3 required steps passed"),
        `unexpected banner: ${banner}`,
      );
      const fulfillResolved = await page.locator("li").nth(3).locator(
        ".resolved",
      ).textContent();
      assert(
        fulfillResolved?.includes("card-t-1"),
        `fulfill should have resolved the card alternative: ${fulfillResolved}`,
      );
    } finally {
      await browser.close();
      await server.stop();
    }
  },
});

// ── cross-module: declared $inputs + the shared variable scope ───────────────

@EndpointController("a")
class AlphaController {
  @Endpoint({ path: "create", input: CreateDto, output: ThingDto, order: 1 })
  create(body: CreateDto): ThingDto {
    return { id: "thing-7", name: body.name ?? "anon" };
  }
}

@EndpointController("b")
class BetaController {
  // The id comes from OUTSIDE this module — a declared external input.
  @Endpoint({
    path: "register",
    input: RefDto,
    output: ThingDto,
    order: 1,
    bind: { id: "$thingId" },
  })
  register(body: RefDto): ThingDto {
    if (!body?.id) throw new Error("missing id");
    return { id: body.id, name: "registered" };
  }
}

const AlphaModule = endpointModule("Alpha", [AlphaController]);
const BetaModule = endpointModule("Beta", [BetaController]);

Deno.test({
  name:
    "emulator — cross-module $inputs and global captures span docs pages (headless chromium)",
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const port = 9612;
    const server = await bootstrapServer("xmod", [AlphaModule, BetaModule], {
      port,
    });
    await server.listen();
    const { chromium } = await import("#playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();

      // Run alpha's create — its output is captured AND published to the shared scope.
      await page.goto(`http://localhost:${port}/docs/alpha`);
      await page.locator("button.emulate").nth(0).click();
      await page.locator("li .dot.ok").first().waitFor();

      // Beta's page: the declared input is listed (unset), and the body references it.
      await page.goto(`http://localhost:${port}/docs/beta`);
      assertEquals(await page.locator("#inputs-card").isVisible(), true);
      const body = await page.locator("li").nth(0).locator("textarea")
        .inputValue();
      assert(
        body.includes("{{$thingId}}"),
        `beta's body should reference the module input: ${body}`,
      );
      // Alpha's capture is visible here as a module-qualified variable.
      const vars = await page.locator("#vars").textContent();
      assert(
        vars?.includes("alpha:create.id"),
        `alpha's capture not in beta's variables panel: ${vars}`,
      );

      // Point the input at alpha's capture once — references resolve recursively, so every
      // future alpha re-run feeds beta with no copying.
      await page.locator('#inputs input[data-gvar="thingId"]').fill(
        "{{alpha:create.id}}",
      );
      const resolved = await page.locator("li").nth(0).locator(".resolved")
        .textContent();
      assert(
        resolved?.includes("thing-7"),
        `beta's resolved request should carry alpha's id: ${resolved}`,
      );
      await page.locator("button.emulate").nth(0).click();
      await page.locator("li .dot.ok").first().waitFor();
      const resp = await page.locator("li").nth(0).locator(".resp")
        .textContent();
      assert(
        resp?.includes('"registered"'),
        `beta's endpoint did not receive the cross-module id: ${resp}`,
      );
    } finally {
      await browser.close();
      await server.stop();
    }
  },
});

// ── contract auto-wiring: a composed producer satisfies a $input untouched ───

class MemberOutDto {
  @ApiProperty()
  memberId!: string;
}
class GreetInDto {
  @ApiProperty()
  memberId!: string;
}
class GreetOutDto {
  @ApiProperty()
  greeting!: string;
}

@EndpointController("mint")
class MintController {
  @Endpoint({
    path: "member",
    input: CreateDto,
    output: MemberOutDto,
    order: 1,
  })
  mintMember(_body: CreateDto): MemberOutDto {
    return { memberId: "m-42" };
  }
}

@EndpointController("greet")
class GreetController {
  // memberId is external to THIS module — but the composed mint module produces it.
  @Endpoint({
    path: "hello",
    input: GreetInDto,
    output: GreetOutDto,
    order: 1,
    bind: { memberId: "$memberId" },
  })
  hello(body: GreetInDto): GreetOutDto {
    if (!body?.memberId) throw new Error("missing memberId");
    return { greeting: `hi ${body.memberId}` };
  }
}

const MintModule = endpointModule("Mint", [MintController]);
const GreetModule = endpointModule("Greet", [GreetController]);

Deno.test({
  name:
    "emulator — a composed producer auto-satisfies a $input (headless chromium)",
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const port = 9614;
    const server = await bootstrapServer("xauto", [MintModule, GreetModule], {
      port,
    });
    await server.listen();
    const { chromium } = await import("#playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();

      // Run the producer's step — its capture (memberId) lands in the shared scope.
      await page.goto(`http://localhost:${port}/docs/mint`);
      await page.locator("button.emulate").nth(0).click();
      await page.locator("li .dot.ok").first().waitFor();

      // The consumer page: the module-inputs row is satisfied automatically — dim "auto"
      // note, no amber unset treatment — without typing anything.
      await page.goto(`http://localhost:${port}/docs/greet`);
      assertEquals(await page.locator("#inputs-card").isVisible(), true);
      const autoNote = await page.locator("#inputs .input-auto").textContent();
      assert(
        autoNote?.includes("auto: mint:mintMember.memberId"),
        `module input should show the auto affordance: ${autoNote}`,
      );
      assertEquals(await page.locator("#inputs .var-name.unset").count(), 0);
      const resolved = await page.locator("li").nth(0).locator(".resolved")
        .textContent();
      assert(
        resolved?.includes("m-42"),
        `the resolved request should carry the producer's capture: ${resolved}`,
      );

      // The consumer step goes green with no manual input at all.
      await page.locator("button.emulate").nth(0).click();
      await page.locator("li .dot.ok").first().waitFor();
      const resp = await page.locator("li").nth(0).locator(".resp")
        .textContent();
      assert(
        resp?.includes("hi m-42"),
        `the consumer endpoint did not receive the produced value: ${resp}`,
      );
    } finally {
      await browser.close();
      await server.stop();
    }
  },
});
