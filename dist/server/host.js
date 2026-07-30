// server/host.ts
import { defineWorkbenchExtension } from "@forgeax/workbench-host/node";

// server/host/fixtures/nodia.blueprint.json
var nodia_blueprint_default = {
  version: "wb-game-video.graph.v1",
  variables: {
    qi: {
      id: "qi",
      name: "\u6C14\u529B",
      initial: 0,
      min: 0,
      max: 5
    },
    lizhi: {
      id: "lizhi",
      name: "\u7406\u667A",
      initial: 5,
      min: 0,
      max: 12
    },
    yezhang: {
      id: "yezhang",
      name: "\u4E1A\u969C",
      initial: 1,
      min: 0,
      max: 12
    },
    lotusClue: {
      id: "lotusClue",
      name: "\u83B2\u82B1\u5996\u7EBF\u7D22",
      initial: 0
    },
    mineFirst: {
      id: "mineFirst",
      name: "\u6211\u65B9\u5148\u624B",
      initial: 1,
      min: 0,
      max: 1
    },
    combo: {
      id: "combo",
      name: "\u8FDE\u51FB\u6BB5\u6570",
      initial: 0,
      min: 0,
      max: 4
    },
    critRate: {
      id: "critRate",
      name: "\u66B4\u51FB\u7387",
      initial: 0.1,
      min: 0,
      max: 1
    },
    myTurn: {
      id: "myTurn",
      name: "\u6211\u65B9\u56DE\u5408\u6570",
      initial: 0,
      min: 0
    },
    healCd: {
      id: "healCd",
      name: "\u6062\u590D\u51B7\u5374",
      initial: 0,
      min: 0,
      max: 3
    }
  },
  entities: {
    "ent-player": {
      id: "ent-player",
      name: "\u7A7A\u85CF",
      kind: "player",
      attrs: {
        attack: 80,
        defense: 40,
        speed: 30,
        hp: 300,
        hpMax: 300
      },
      attrMeta: {
        hp: {
          min: 0,
          max: 300,
          initial: 300,
          label: "\u751F\u547D"
        }
      }
    },
    "ent-boss": {
      id: "ent-boss",
      name: "\u5C0F\u602A",
      kind: "boss",
      attrs: {
        attack: 75,
        defense: 50,
        speed: 25,
        hp: 700,
        hpMax: 700
      },
      attrMeta: {
        hp: {
          min: 0,
          max: 700,
          initial: 700,
          label: "\u751F\u547D"
        }
      }
    }
  },
  formulas: {
    "fx-dmg": {
      id: "fx-dmg",
      name: "\u4F24\u5BB3\u516C\u5F0F",
      description: "\u230A\u7CFB\u6570 \xD7 \u653B\u51FB\u529B \xD7 100 \xF7 (100+\u9632\u5FA1\u529B) \xD7 \u6D6E\u52A8 \xD7 \u66B4\u51FB\u230B",
      ast: {
        t: "unary",
        id: "f23",
        op: "-",
        x: {
          t: "call",
          id: "f22",
          name: "floor",
          args: [
            {
              t: "bin",
              id: "f21",
              op: "*",
              a: {
                t: "bin",
                id: "f20",
                op: "*",
                a: {
                  t: "bin",
                  id: "f19",
                  op: "/",
                  a: {
                    t: "bin",
                    id: "f15",
                    op: "*",
                    a: {
                      t: "bin",
                      id: "f13",
                      op: "*",
                      a: {
                        t: "hole",
                        id: "f11",
                        holeId: "h_mult",
                        kind: "number",
                        label: "\u7CFB\u6570"
                      },
                      b: {
                        t: "hole",
                        id: "f12",
                        holeId: "h_atk",
                        kind: "entityAttr",
                        label: "\u653B\u51FB\u65B9\u653B\u51FB\u529B",
                        suggestAttr: "attack"
                      }
                    },
                    b: {
                      t: "num",
                      id: "f14",
                      v: 100
                    }
                  },
                  b: {
                    t: "bin",
                    id: "f18",
                    op: "+",
                    a: {
                      t: "num",
                      id: "f16",
                      v: 100
                    },
                    b: {
                      t: "hole",
                      id: "f17",
                      holeId: "h_def",
                      kind: "entityAttr",
                      label: "\u9632\u5FA1\u65B9\u9632\u5FA1\u529B",
                      suggestAttr: "defense"
                    }
                  }
                },
                b: {
                  t: "bin",
                  id: "f4",
                  op: "+",
                  a: {
                    t: "num",
                    id: "f0",
                    v: 0.85
                  },
                  b: {
                    t: "bin",
                    id: "f3",
                    op: "*",
                    a: {
                      t: "call",
                      id: "f1",
                      name: "rand",
                      args: []
                    },
                    b: {
                      t: "num",
                      id: "f2",
                      v: 0.3
                    }
                  }
                }
              },
              b: {
                t: "bin",
                id: "f10",
                op: "+",
                a: {
                  t: "num",
                  id: "f5",
                  v: 1
                },
                b: {
                  t: "bin",
                  id: "f9",
                  op: "*",
                  a: {
                    t: "call",
                    id: "f7",
                    name: "chance",
                    args: [
                      {
                        t: "hole",
                        id: "f6",
                        holeId: "h_crit",
                        kind: "number",
                        label: "\u66B4\u51FB\u7387"
                      }
                    ]
                  },
                  b: {
                    t: "num",
                    id: "f8",
                    v: 0.5
                  }
                }
              }
            }
          ]
        }
      }
    },
    "fx-dmg-combo": {
      id: "fx-dmg-combo",
      name: "\u8FDE\u51FB\u5206\u6BB5\u4F24\u5BB3",
      description: "\u230A\u653B\u51FB\u529B \xD7 100 \xF7 (100+\u9632\u5FA1\u529B) \xD7 \u8FDE\u51FB\u5206\u6BB5\u7CFB\u6570 \xD7 \u6D6E\u52A8\u230B\uFF08\u7CFB\u6570\u968F combo \u6BB5\u53D8\u5316\uFF09",
      ast: {
        t: "unary",
        id: "f62",
        op: "-",
        x: {
          t: "call",
          id: "f61",
          name: "floor",
          args: [
            {
              t: "bin",
              id: "f60",
              op: "*",
              a: {
                t: "bin",
                id: "f53",
                op: "/",
                a: {
                  t: "bin",
                  id: "f49",
                  op: "*",
                  a: {
                    t: "hole",
                    id: "f47",
                    holeId: "hc_atk",
                    kind: "entityAttr",
                    label: "\u653B\u51FB\u65B9\u653B\u51FB\u529B",
                    suggestAttr: "attack"
                  },
                  b: {
                    t: "num",
                    id: "f48",
                    v: 100
                  }
                },
                b: {
                  t: "bin",
                  id: "f52",
                  op: "+",
                  a: {
                    t: "num",
                    id: "f50",
                    v: 100
                  },
                  b: {
                    t: "hole",
                    id: "f51",
                    holeId: "hc_def",
                    kind: "entityAttr",
                    label: "\u9632\u5FA1\u65B9\u9632\u5FA1\u529B",
                    suggestAttr: "defense"
                  }
                }
              },
              b: {
                t: "bin",
                id: "f59",
                op: "*",
                a: {
                  t: "bin",
                  id: "f46",
                  op: "+",
                  a: {
                    t: "bin",
                    id: "f40",
                    op: "+",
                    a: {
                      t: "bin",
                      id: "f34",
                      op: "+",
                      a: {
                        t: "bin",
                        id: "f28",
                        op: "*",
                        a: {
                          t: "num",
                          id: "f24",
                          v: 0.25
                        },
                        b: {
                          t: "bin",
                          id: "f27",
                          op: "==",
                          a: {
                            t: "ref",
                            id: "f25",
                            ref: {
                              kind: "var",
                              varId: "combo"
                            }
                          },
                          b: {
                            t: "num",
                            id: "f26",
                            v: 1
                          }
                        }
                      },
                      b: {
                        t: "bin",
                        id: "f33",
                        op: "*",
                        a: {
                          t: "num",
                          id: "f29",
                          v: 0.3
                        },
                        b: {
                          t: "bin",
                          id: "f32",
                          op: "==",
                          a: {
                            t: "ref",
                            id: "f30",
                            ref: {
                              kind: "var",
                              varId: "combo"
                            }
                          },
                          b: {
                            t: "num",
                            id: "f31",
                            v: 2
                          }
                        }
                      }
                    },
                    b: {
                      t: "bin",
                      id: "f39",
                      op: "*",
                      a: {
                        t: "num",
                        id: "f35",
                        v: 0.35
                      },
                      b: {
                        t: "bin",
                        id: "f38",
                        op: "==",
                        a: {
                          t: "ref",
                          id: "f36",
                          ref: {
                            kind: "var",
                            varId: "combo"
                          }
                        },
                        b: {
                          t: "num",
                          id: "f37",
                          v: 3
                        }
                      }
                    }
                  },
                  b: {
                    t: "bin",
                    id: "f45",
                    op: "*",
                    a: {
                      t: "num",
                      id: "f41",
                      v: 0.4
                    },
                    b: {
                      t: "bin",
                      id: "f44",
                      op: "==",
                      a: {
                        t: "ref",
                        id: "f42",
                        ref: {
                          kind: "var",
                          varId: "combo"
                        }
                      },
                      b: {
                        t: "num",
                        id: "f43",
                        v: 4
                      }
                    }
                  }
                },
                b: {
                  t: "bin",
                  id: "f58",
                  op: "+",
                  a: {
                    t: "num",
                    id: "f54",
                    v: 0.85
                  },
                  b: {
                    t: "bin",
                    id: "f57",
                    op: "*",
                    a: {
                      t: "call",
                      id: "f55",
                      name: "rand",
                      args: []
                    },
                    b: {
                      t: "num",
                      id: "f56",
                      v: 0.3
                    }
                  }
                }
              }
            }
          ]
        }
      }
    },
    "fx-heal": {
      id: "fx-heal",
      name: "\u6062\u590D\u516C\u5F0F",
      description: "\u230A\u751F\u547D\u4E0A\u9650 \xD7 12%\u230B",
      ast: {
        t: "call",
        id: "f66",
        name: "floor",
        args: [
          {
            t: "bin",
            id: "f65",
            op: "*",
            a: {
              t: "hole",
              id: "f63",
              holeId: "hh_max",
              kind: "entityAttr",
              label: "\u751F\u547D\u4E0A\u9650",
              suggestAttr: "hpMax"
            },
            b: {
              t: "num",
              id: "f64",
              v: 0.12
            }
          }
        ]
      }
    }
  },
  ui: {
    overlays: {}
  },
  graph: {
    nodes: [
      {
        id: "n_open",
        type: "perf",
        position: {
          x: 40,
          y: 310
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u5E8F\u7AE0",
          durationMs: 15975,
          media: {
            kind: "VIDEO",
            ref: "narr-open"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_door",
        type: "perf",
        position: {
          x: 370,
          y: 310
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u6148\u60B2\u72F1\u95E8\u53E3",
          durationMs: 15100,
          media: {
            kind: "VIDEO",
            ref: "narr-door"
          },
          overlayNodes: [
            {
              overlay: "base:inkKou",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "pass"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-door-pass"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "fail"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-door-fail"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "n_door",
              removed: [
                "inkKou-0"
              ],
              added: [
                {
                  id: "kou",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    glyph: "\u53E9",
                    events: [
                      {
                        id: "pass",
                        label: "\u53E9\u4E2D"
                      },
                      {
                        id: "fail",
                        label: "\u9519\u8FC7"
                      }
                    ],
                    cues: [
                      {
                        id: "kou-0",
                        x: 0.58,
                        y: 0.39,
                        appearAt: 0,
                        targetAt: 1e3,
                        endAt: 6100
                      }
                    ],
                    timeoutMs: 6100,
                    defaultEvent: "fail"
                  },
                  component: "inkKou",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0,
                    endMs: 6100
                  }
                }
              ]
            }
          ]
        }
      },
      {
        id: "n_soul",
        type: "perf",
        position: {
          x: 700,
          y: 270
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u5C0F\u9B42\u5BF9\u8BDD",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-soul"
          },
          overlayNodes: [
            {
              overlay: "base:dialogue",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "n_soul",
              removed: [
                "dialogue-0"
              ],
              added: [
                {
                  id: "soul-line",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    speaker: "\u5C0F\u9B42",
                    text: "\u2026\u2026\u4F60\u4E5F\u662F\u6765\u6E21\u6CB3\u7684\u5417\uFF1F",
                    color: "#ffd54a"
                  },
                  component: "dialogue",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            }
          ]
        }
      },
      {
        id: "n_river",
        type: "perf",
        position: {
          x: 1030,
          y: 310
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u5212\u8239\u6E21\u6CB3",
          durationMs: 15069,
          media: {
            kind: "VIDEO",
            ref: "narr-river"
          },
          overlayNodes: [
            {
              overlay: "base:inkYingMo",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "ying"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-river-ying"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "mo"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-river-mo"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              overrides: {
                "inkYingMo-0": {
                  trigger: {
                    when: "at",
                    ms: 12069
                  },
                  window: {
                    startMs: 12069
                  }
                }
              }
            }
          ]
        }
      },
      {
        id: "n_child",
        type: "perf",
        position: {
          x: 1360,
          y: 270
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u5C0F\u5B69\u5BF9\u8BDD",
          durationMs: 12887,
          media: {
            kind: "VIDEO",
            ref: "narr-child"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_land",
        type: "perf",
        position: {
          x: 1690,
          y: 310
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u4E0A\u5CB8",
          durationMs: 16200,
          media: {
            kind: "VIDEO",
            ref: "narr-land"
          },
          overlayNodes: [
            {
              overlay: "base:inkYingMo",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "ying"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-land-ying"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "mo"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-land-mo"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              overrides: {
                "inkYingMo-0": {
                  trigger: {
                    when: "at",
                    ms: 13200
                  },
                  window: {
                    startMs: 13200
                  }
                }
              }
            }
          ]
        }
      },
      {
        id: "n_mask",
        type: "perf",
        position: {
          x: 2020,
          y: 270
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u706F\u7B3C\u5BF9\u8BDD",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-mask"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_mengpo",
        type: "perf",
        position: {
          x: 2350,
          y: 310
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u8FC7\u6865\u89C1\u5B5F\u5A46",
          durationMs: 17136,
          media: {
            kind: "VIDEO",
            ref: "narr-mengpo"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_tea",
        type: "perf",
        position: {
          x: 2680,
          y: 310
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u559D\u5B5F\u5A46\u6C64",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-tea"
          },
          overlayNodes: [
            {
              overlay: "base:inkYingMo",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "ying"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-tea-ying"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "mo"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-tea-mo"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              overrides: {
                "inkYingMo-0": {
                  trigger: {
                    when: "at",
                    ms: 12093
                  },
                  window: {
                    startMs: 12093
                  }
                }
              }
            }
          ]
        }
      },
      {
        id: "n_drink",
        type: "perf",
        position: {
          x: 3010,
          y: 440
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u996E\u6C64\u5E94\u7B54",
          durationMs: 14489,
          media: {
            kind: "VIDEO",
            ref: "narr-drink"
          },
          reactions: [
            {
              when: {
                type: "at",
                ms: 0
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "drink-lizhi",
                      kind: "var",
                      varId: "lizhi",
                      op: "add",
                      value: -1
                    },
                    {
                      id: "drink-yezhang",
                      kind: "var",
                      varId: "yezhang",
                      op: "add",
                      value: 1
                    }
                  ]
                }
              ]
            }
          ],
          overlayNodes: []
        }
      },
      {
        id: "n_nodrink",
        type: "perf",
        position: {
          x: 3010,
          y: 180
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u4E0D\u559D",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-nodrink"
          },
          overlayNodes: [
            {
              overlay: "base:inkYingMo",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "ying"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-nodrink-ying"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "mo"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-nodrink-mo"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              overrides: {
                "inkYingMo-0": {
                  trigger: {
                    when: "at",
                    ms: 12093
                  },
                  window: {
                    startMs: 12093
                  }
                }
              }
            }
          ]
        }
      },
      {
        id: "n_follow",
        type: "perf",
        position: {
          x: 3340,
          y: 440
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u8DDF\u968F\u5F15\u9B42",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-follow"
          },
          overlayNodes: [
            {
              overlay: "base:inkYingMo",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "ying"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-follow-ying"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "mo"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-follow-mo"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              overrides: {
                "inkYingMo-0": {
                  trigger: {
                    when: "at",
                    ms: 12093
                  },
                  window: {
                    startMs: 12093
                  }
                }
              }
            }
          ]
        }
      },
      {
        id: "n_getlight",
        type: "perf",
        position: {
          x: 3670,
          y: 460
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u83B7\u53D6\u9053\u5177",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-getlight"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_nolight",
        type: "perf",
        position: {
          x: 3670,
          y: 320
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u6CA1\u80FD\u9053\u5177",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-nolight"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_nofollow",
        type: "perf",
        position: {
          x: 3340,
          y: 160
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u4E0D\u8DDF\u968F",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-nofollow"
          },
          overlayNodes: [
            {
              overlay: "base:inkYingMo",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "ying"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-nofollow-ying"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "mo"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-nofollow-mo"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              overrides: {
                "inkYingMo-0": {
                  trigger: {
                    when: "at",
                    ms: 12093
                  },
                  window: {
                    startMs: 12093
                  }
                }
              }
            }
          ]
        }
      },
      {
        id: "n_lotus",
        type: "perf",
        position: {
          x: 3670,
          y: 180
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u63A5\u8FC7\u83B2\u85D5",
          durationMs: 15093,
          media: {
            kind: "VIDEO",
            ref: "narr-lotus"
          },
          overlayNodes: []
        }
      },
      {
        id: "n_nolotus",
        type: "perf",
        position: {
          x: 3670,
          y: 40
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u4E0D\u8981\u83B2\u85D5",
          durationMs: 15069,
          media: {
            kind: "VIDEO",
            ref: "narr-nolotus"
          },
          reactions: [
            {
              when: {
                type: "at",
                ms: 0
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "nolotus-clue",
                      kind: "var",
                      varId: "lotusClue",
                      op: "set",
                      value: 1
                    }
                  ]
                }
              ]
            }
          ],
          overlayNodes: []
        }
      },
      {
        id: "enter",
        type: "perf",
        position: {
          x: 4e3,
          y: 260
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u8FDB\u6218\u5F85\u673A",
          durationMs: 3e3,
          media: {
            kind: "VIDEO",
            ref: "idle01"
          },
          mediaPlayMode: "once",
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "complete",
                if: {
                  all: [
                    {
                      type: "attrCompare",
                      left: "ent-player",
                      right: "ent-boss",
                      attr: "speed",
                      op: "gte"
                    }
                  ]
                }
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "first-me",
                      kind: "var",
                      varId: "mineFirst",
                      op: "set",
                      value: 1
                    }
                  ]
                }
              ]
            },
            {
              when: {
                type: "complete"
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "first-foe",
                      kind: "var",
                      varId: "mineFirst",
                      op: "set",
                      value: 0
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "a_my",
        type: "perf",
        position: {
          x: 4330,
          y: 190
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u6211\u65B9\u56DE\u5408",
          durationMs: 0,
          subFlow: "wait"
        }
      },
      {
        id: "b_ai",
        type: "perf",
        position: {
          x: 4660,
          y: 280
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u654C\u65B9\u56DE\u5408",
          durationMs: 0,
          subFlow: "tele"
        }
      },
      {
        id: "wait",
        type: "perf",
        position: {
          x: 4330,
          y: 720
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u6218\u6597\u5F85\u673A",
          durationMs: 8e3,
          media: {
            kind: "VIDEO",
            ref: "idle01"
          },
          mediaPlayMode: "loop",
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:battleSkillBar",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "light"
                  },
                  do: [
                    {
                      kind: "effect",
                      effects: [
                        {
                          id: "sk-light-qi",
                          kind: "var",
                          varId: "qi",
                          op: "add",
                          value: 2
                        }
                      ]
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "heavy"
                  },
                  do: [
                    {
                      kind: "effect",
                      effects: [
                        {
                          id: "sk-heavy-qi",
                          kind: "var",
                          varId: "qi",
                          op: "add",
                          value: -2
                        }
                      ]
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "medit"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-sk-medit"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "ult"
                  },
                  do: [
                    {
                      kind: "effect",
                      effects: [
                        {
                          id: "sk-ult-qi",
                          kind: "var",
                          varId: "qi",
                          op: "set",
                          value: 0
                        }
                      ]
                    },
                    {
                      kind: "advance",
                      edgeId: "e-sk-ult"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "wait",
              removed: [
                "battleSkillBar-0"
              ],
              added: [
                {
                  id: "skill",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    events: [
                      {
                        id: "light",
                        label: "\u8F7B\u653B\u51FB"
                      },
                      {
                        id: "heavy",
                        label: "\u91CD\u653B\u51FB",
                        condition: {
                          all: [
                            {
                              type: "var",
                              varId: "qi",
                              op: "gte",
                              value: 2
                            }
                          ]
                        }
                      },
                      {
                        id: "medit",
                        label: "\u51A5\u60F3"
                      },
                      {
                        id: "ult",
                        label: "\u706D\u4E16",
                        condition: {
                          all: [
                            {
                              type: "var",
                              varId: "qi",
                              op: "gte",
                              value: 5
                            },
                            {
                              type: "var",
                              varId: "lizhi",
                              op: "gte",
                              value: 4
                            }
                          ]
                        }
                      }
                    ],
                    x: 0.5,
                    y: 0.88
                  },
                  component: "battleSkillBar",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            }
          ]
        }
      },
      {
        id: "pu",
        type: "perf",
        position: {
          x: 4660,
          y: 1070
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u8F7B\u653B\u51FB",
          durationMs: 5e3,
          media: {
            kind: "VIDEO",
            ref: "pugong"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "pu",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "pu-fx",
                  trigger: {
                    when: "at",
                    ms: 1e3
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-player.attr.attack)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 1e3
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 1e3
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "pu-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-floor(1 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * (0.85 + rand() * 0.3) * (1 + chance(0) * 0.5))",
                        pick: {
                          mode: "formula",
                          formulaId: "fx-dmg",
                          holeBindings: {
                            h_mult: {
                              kind: "number",
                              value: 1
                            },
                            h_atk: {
                              kind: "entityAttr",
                              entityId: "ent-player",
                              attr: "attack"
                            },
                            h_def: {
                              kind: "entityAttr",
                              entityId: "ent-boss",
                              attr: "defense"
                            },
                            h_crit: {
                              kind: "number",
                              value: 0
                            }
                          }
                        }
                      }
                    },
                    {
                      id: "pu-combo",
                      kind: "var",
                      varId: "combo",
                      op: "set",
                      value: 1
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "pu2",
        type: "perf",
        position: {
          x: 4660,
          y: 930
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u8F7B\u653B\u51FB\xB7\u53D8\u62DB",
          durationMs: 5e3,
          media: {
            kind: "VIDEO",
            ref: "pugong2"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "pu2",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "pu2-fx",
                  trigger: {
                    when: "at",
                    ms: 600
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-player.attr.attack * 13 / 10)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 600
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 600
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "pu2-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-floor(entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * ((0.25 * (var.combo == 1) + 0.3 * (var.combo == 2) + 0.35 * (var.combo == 3) + 0.4 * (var.combo == 4)) * (0.85 + rand() * 0.3)))",
                        pick: {
                          mode: "formula",
                          formulaId: "fx-dmg-combo",
                          holeBindings: {
                            hc_atk: {
                              kind: "entityAttr",
                              entityId: "ent-player",
                              attr: "attack"
                            },
                            hc_def: {
                              kind: "entityAttr",
                              entityId: "ent-boss",
                              attr: "defense"
                            }
                          }
                        }
                      }
                    },
                    {
                      id: "pu2-combo",
                      kind: "var",
                      varId: "combo",
                      op: "add",
                      value: 1
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "zhong",
        type: "perf",
        position: {
          x: 4660,
          y: 790
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u91CD\u653B\u51FB",
          durationMs: 6e3,
          media: {
            kind: "VIDEO",
            ref: "zhonggongji"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "zhong",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "zhong-fx",
                  trigger: {
                    when: "at",
                    ms: 1700
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-player.attr.attack * 18 / 10)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 1700
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 1700
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "zhong-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-floor(1.8 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * (0.85 + rand() * 0.3) * (1 + chance(0.05) * 0.5) * chance(0.95))",
                        pick: {
                          mode: "formula",
                          formulaId: "fx-dmg",
                          holeBindings: {
                            h_mult: {
                              kind: "number",
                              value: 1.8
                            },
                            h_atk: {
                              kind: "entityAttr",
                              entityId: "ent-player",
                              attr: "attack"
                            },
                            h_def: {
                              kind: "entityAttr",
                              entityId: "ent-boss",
                              attr: "defense"
                            },
                            h_crit: {
                              kind: "number",
                              value: 0.05
                            }
                          }
                        }
                      }
                    },
                    {
                      id: "zhong-crit",
                      kind: "var",
                      varId: "critRate",
                      op: "add",
                      value: 0.05
                    },
                    {
                      id: "zhong-break",
                      kind: "flag",
                      flagId: "boss-broken",
                      value: true
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "z2",
        type: "perf",
        position: {
          x: 4660,
          y: 650
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u91CD\u653B\u51FB\xB7\u53D8\u62DB",
          durationMs: 6e3,
          media: {
            kind: "VIDEO",
            ref: "zhonggongji2"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "z2",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "z2-fx",
                  trigger: {
                    when: "at",
                    ms: 2500
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-player.attr.attack * 24 / 10)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 2500
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 2500
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "z2-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-floor(entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * ((0.25 * (var.combo == 1) + 0.3 * (var.combo == 2) + 0.35 * (var.combo == 3) + 0.4 * (var.combo == 4)) * (0.85 + rand() * 0.3)))",
                        pick: {
                          mode: "formula",
                          formulaId: "fx-dmg-combo",
                          holeBindings: {
                            hc_atk: {
                              kind: "entityAttr",
                              entityId: "ent-player",
                              attr: "attack"
                            },
                            hc_def: {
                              kind: "entityAttr",
                              entityId: "ent-boss",
                              attr: "defense"
                            }
                          }
                        }
                      }
                    },
                    {
                      id: "z2-crit",
                      kind: "var",
                      varId: "critRate",
                      op: "add",
                      value: 0.05
                    },
                    {
                      id: "z2-break",
                      kind: "flag",
                      flagId: "boss-broken",
                      value: true
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "fuzhu",
        type: "perf",
        position: {
          x: 4660,
          y: 510
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u51A5\u60F3",
          durationMs: 5e3,
          media: {
            kind: "VIDEO",
            ref: "huiqi"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "fuzhu",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "fuzhu-fx",
                  trigger: {
                    when: "at",
                    ms: 2e3
                  },
                  inputs: {
                    text: "+30",
                    x: 0.5,
                    y: 0.42,
                    color: "#5fbf7f"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 2e3
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 2e3
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "fuzhu-heal",
                      kind: "attr",
                      entityId: "ent-player",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "floor(entity.ent-player.attr.hpMax * 0.12)",
                        pick: {
                          mode: "formula",
                          formulaId: "fx-heal",
                          holeBindings: {
                            hh_max: {
                              kind: "entityAttr",
                              entityId: "ent-player",
                              attr: "hpMax"
                            }
                          }
                        }
                      }
                    },
                    {
                      id: "fuzhu-qi",
                      kind: "var",
                      varId: "qi",
                      op: "add",
                      value: 2
                    },
                    {
                      id: "fuzhu-cd",
                      kind: "var",
                      varId: "healCd",
                      op: "set",
                      value: 3
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "ult",
        type: "perf",
        position: {
          x: 4660,
          y: 370
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u706D\u4E16",
          durationMs: 12e3,
          media: {
            kind: "VIDEO",
            ref: "dazhao"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "ult",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "ult-fx",
                  trigger: {
                    when: "at",
                    ms: 7e3
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-player.attr.attack * 3)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 7e3
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 7e3
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "ult-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-floor(3 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * (0.85 + rand() * 0.3) * (1 + chance(0.05) * 0.5))",
                        pick: {
                          mode: "formula",
                          formulaId: "fx-dmg",
                          holeBindings: {
                            h_mult: {
                              kind: "number",
                              value: 3
                            },
                            h_atk: {
                              kind: "entityAttr",
                              entityId: "ent-player",
                              attr: "attack"
                            },
                            h_def: {
                              kind: "entityAttr",
                              entityId: "ent-boss",
                              attr: "defense"
                            },
                            h_crit: {
                              kind: "number",
                              value: 0.05
                            }
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "tele",
        type: "perf",
        position: {
          x: 4660,
          y: 600
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u653B\u51FB\u524D\u6447\xB7\u9632\u53CDQTE",
          durationMs: 4e3,
          media: {
            kind: "VIDEO",
            ref: "difanggongjiqianyao"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:battleParry",
              reactions: [
                {
                  when: {
                    type: "event",
                    id: "pass"
                  },
                  do: [
                    {
                      kind: "advance",
                      edgeId: "e-tele-pass"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "good"
                  },
                  do: [
                    {
                      kind: "effect",
                      effects: [
                        {
                          id: "dodge-qi",
                          kind: "var",
                          varId: "qi",
                          op: "add",
                          value: -1
                        }
                      ]
                    },
                    {
                      kind: "advance",
                      edgeId: "e-tele-good"
                    }
                  ]
                },
                {
                  when: {
                    type: "event",
                    id: "fail"
                  },
                  do: [
                    {
                      kind: "effect",
                      effects: [
                        {
                          id: "hurt-qi",
                          kind: "var",
                          varId: "qi",
                          op: "add",
                          value: 1
                        }
                      ]
                    },
                    {
                      kind: "advance",
                      edgeId: "e-tele-fail"
                    }
                  ]
                }
              ],
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "tele",
              removed: [
                "battleParry-0"
              ],
              added: [
                {
                  id: "parry",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    qteKind: "parry",
                    durationMs: 2600,
                    events: [
                      {
                        id: "pass",
                        label: "\u53D7\u51FB\u9632\u53CD"
                      },
                      {
                        id: "good",
                        label: "\u53D7\u51FB\u95EA\u907F"
                      },
                      {
                        id: "fail",
                        label: "\u53D7\u51FB"
                      }
                    ],
                    defaultEvent: "fail",
                    cues: [
                      {
                        id: "parry-0",
                        appearAt: 0,
                        targetAt: 1300,
                        endAt: 2600
                      }
                    ]
                  },
                  component: "battleParry",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0,
                    endMs: 2600
                  }
                }
              ]
            }
          ]
        }
      },
      {
        id: "block",
        type: "perf",
        position: {
          x: 4990,
          y: 740
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u53D7\u51FB\u9632\u53CD",
          durationMs: 4e3,
          media: {
            kind: "VIDEO",
            ref: "fangfan"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "block",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "block-fx",
                  trigger: {
                    when: "at",
                    ms: 1800
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-boss.attr.attack + var.yezhang * 21)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 1800
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 1800
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "block-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-(entity.ent-boss.attr.attack + var.yezhang * 21)"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "dodgeP",
        type: "perf",
        position: {
          x: 4990,
          y: 600
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u53D7\u51FB\u95EA\u907F",
          durationMs: 4e3,
          media: {
            kind: "VIDEO",
            ref: "shanbi"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "dodgeP",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "dodgeP-fx",
                  trigger: {
                    when: "at",
                    ms: 2e3
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ffd54a",
                    expr: "-(entity.ent-boss.attr.attack - entity.ent-player.attr.defense / 4)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 2e3
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 2e3
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "dodge-dmg",
                      kind: "attr",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-(entity.ent-boss.attr.attack - entity.ent-player.attr.defense / 4)"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "hurt",
        type: "perf",
        position: {
          x: 4990,
          y: 460
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u53D7\u51FB",
          durationMs: 4e3,
          media: {
            kind: "VIDEO",
            ref: "shouji"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            },
            {
              overlay: "base:floatText",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "hurt",
              removed: [
                "floatText-0"
              ],
              added: [
                {
                  id: "hurt-fx",
                  trigger: {
                    when: "at",
                    ms: 10
                  },
                  inputs: {
                    text: "{v}",
                    x: 0.5,
                    y: 0.42,
                    color: "#ff5a5a",
                    expr: "-(entity.ent-boss.attr.attack + var.yezhang * 45)"
                  },
                  component: "floatText",
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 10
                  }
                }
              ]
            }
          ],
          reactions: [
            {
              when: {
                type: "at",
                ms: 10
              },
              do: [
                {
                  kind: "effect",
                  effects: [
                    {
                      id: "hurt-dmg",
                      kind: "attr",
                      entityId: "ent-player",
                      attr: "hp",
                      op: "add",
                      value: {
                        expr: "-(entity.ent-boss.attr.attack + var.yezhang * 45)"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "win",
        type: "perf",
        position: {
          x: 4990,
          y: 140
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u6218\u6597\u80DC\u5229",
          durationMs: 1e4,
          media: {
            kind: "VIDEO",
            ref: "shengli"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            }
          ]
        }
      },
      {
        id: "lose",
        type: "perf",
        position: {
          x: 4990,
          y: 280
        },
        inputs: [],
        outputs: [],
        data: {
          name: "\u6218\u6597\u5931\u8D25",
          durationMs: 6e3,
          media: {
            kind: "VIDEO",
            ref: "shibai"
          },
          overlayNodes: [
            {
              overlay: "base:battleHpBar",
              layout: {
                left: 0,
                top: 0,
                width: 1,
                height: 1
              },
              id: "battleHud",
              removed: [
                "battleHpBar-0"
              ],
              added: [
                {
                  id: "playerHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-player",
                    label: "\u7A7A\u85CF"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                },
                {
                  id: "bossHp",
                  component: "battleHpBar",
                  trigger: {
                    when: "enter"
                  },
                  inputs: {
                    bind: "ent-boss",
                    label: "\u5C0F\u602A"
                  },
                  layout: {
                    left: 0,
                    top: 0,
                    width: 1,
                    height: 1
                  },
                  window: {
                    startMs: 0
                  }
                }
              ]
            }
          ]
        }
      }
    ],
    edges: [
      {
        id: "e-open",
        source: "n_open",
        target: "n_door",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-door-pass",
        source: "n_door",
        target: "n_soul",
        sourceHandle: "pass",
        targetHandle: "in"
      },
      {
        id: "e-door-fail",
        source: "n_door",
        target: "n_river",
        sourceHandle: "fail",
        targetHandle: "in"
      },
      {
        id: "e-soul",
        source: "n_soul",
        target: "n_river",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-river-ying",
        source: "n_river",
        target: "n_child",
        sourceHandle: "ying",
        targetHandle: "in"
      },
      {
        id: "e-river-mo",
        source: "n_river",
        target: "n_land",
        sourceHandle: "mo",
        targetHandle: "in"
      },
      {
        id: "e-child",
        source: "n_child",
        target: "n_land",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-land-ying",
        source: "n_land",
        target: "n_mask",
        sourceHandle: "ying",
        targetHandle: "in"
      },
      {
        id: "e-land-mo",
        source: "n_land",
        target: "n_mengpo",
        sourceHandle: "mo",
        targetHandle: "in"
      },
      {
        id: "e-mask",
        source: "n_mask",
        target: "n_mengpo",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-mengpo",
        source: "n_mengpo",
        target: "n_tea",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-tea-ying",
        source: "n_tea",
        target: "n_drink",
        sourceHandle: "ying",
        targetHandle: "in"
      },
      {
        id: "e-tea-mo",
        source: "n_tea",
        target: "n_nodrink",
        sourceHandle: "mo",
        targetHandle: "in"
      },
      {
        id: "e-drink",
        source: "n_drink",
        target: "n_follow",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-nodrink-ying",
        source: "n_nodrink",
        target: "n_follow",
        sourceHandle: "ying",
        targetHandle: "in"
      },
      {
        id: "e-nodrink-mo",
        source: "n_nodrink",
        target: "n_nofollow",
        sourceHandle: "mo",
        targetHandle: "in"
      },
      {
        id: "e-follow-ying",
        source: "n_follow",
        target: "n_getlight",
        sourceHandle: "ying",
        targetHandle: "in"
      },
      {
        id: "e-follow-mo",
        source: "n_follow",
        target: "n_nolight",
        sourceHandle: "mo",
        targetHandle: "in"
      },
      {
        id: "e-getlight",
        source: "n_getlight",
        target: "enter",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-nolight",
        source: "n_nolight",
        target: "enter",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-nofollow-ying",
        source: "n_nofollow",
        target: "n_lotus",
        sourceHandle: "ying",
        targetHandle: "in"
      },
      {
        id: "e-nofollow-mo",
        source: "n_nofollow",
        target: "n_nolotus",
        sourceHandle: "mo",
        targetHandle: "in"
      },
      {
        id: "e-lotus",
        source: "n_lotus",
        target: "enter",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-nolotus",
        source: "n_nolotus",
        target: "enter",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-init-me",
        source: "enter",
        target: "a_my",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "attrCompare",
                left: "ent-player",
                right: "ent-boss",
                attr: "speed",
                op: "gte"
              }
            ]
          }
        }
      },
      {
        id: "e-init-foe",
        source: "enter",
        target: "b_ai",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-sk-light",
        source: "wait",
        target: "pu",
        sourceHandle: "light",
        targetHandle: "in",
        data: {
          weight: 1
        }
      },
      {
        id: "e-sk-light2",
        source: "wait",
        target: "pu2",
        sourceHandle: "light",
        targetHandle: "in",
        data: {
          weight: 1
        }
      },
      {
        id: "e-sk-heavy",
        source: "wait",
        target: "zhong",
        sourceHandle: "heavy",
        targetHandle: "in",
        data: {
          weight: 1
        }
      },
      {
        id: "e-sk-heavy2",
        source: "wait",
        target: "z2",
        sourceHandle: "heavy",
        targetHandle: "in",
        data: {
          weight: 1
        }
      },
      {
        id: "e-sk-medit",
        source: "wait",
        target: "fuzhu",
        sourceHandle: "medit",
        targetHandle: "in"
      },
      {
        id: "e-sk-ult",
        source: "wait",
        target: "ult",
        sourceHandle: "ult",
        targetHandle: "in"
      },
      {
        id: "e-tele-pass",
        source: "tele",
        target: "block",
        sourceHandle: "pass",
        targetHandle: "in"
      },
      {
        id: "e-tele-good",
        source: "tele",
        target: "dodgeP",
        sourceHandle: "good",
        targetHandle: "in"
      },
      {
        id: "e-tele-fail",
        source: "tele",
        target: "hurt",
        sourceHandle: "fail",
        targetHandle: "in"
      },
      {
        id: "e-amy-win",
        source: "a_my",
        target: "win",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "attrRatio",
                entityId: "ent-boss",
                attr: "hp",
                op: "lte",
                value: 0
              }
            ]
          }
        }
      },
      {
        id: "e-amy-subflow-entry",
        source: "a_my",
        target: "wait",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "score",
                op: "lt",
                value: 0
              }
            ]
          }
        }
      },
      {
        id: "e-amy-lose",
        source: "a_my",
        target: "lose",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "attrRatio",
                entityId: "ent-player",
                attr: "hp",
                op: "lte",
                value: 0
              }
            ]
          }
        }
      },
      {
        id: "e-amy-foe",
        source: "a_my",
        target: "b_ai",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "var",
                varId: "mineFirst",
                op: "eq",
                value: 1
              }
            ]
          }
        }
      },
      {
        id: "e-amy-loop",
        source: "a_my",
        target: "enter",
        sourceHandle: "default",
        targetHandle: "in"
      },
      {
        id: "e-bai-win",
        source: "b_ai",
        target: "win",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "attrRatio",
                entityId: "ent-boss",
                attr: "hp",
                op: "lte",
                value: 0
              }
            ]
          }
        }
      },
      {
        id: "e-bai-subflow-entry",
        source: "b_ai",
        target: "tele",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "score",
                op: "lt",
                value: 0
              }
            ]
          }
        }
      },
      {
        id: "e-bai-lose",
        source: "b_ai",
        target: "lose",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "attrRatio",
                entityId: "ent-player",
                attr: "hp",
                op: "lte",
                value: 0
              }
            ]
          }
        }
      },
      {
        id: "e-bai-loop",
        source: "b_ai",
        target: "enter",
        sourceHandle: "default",
        targetHandle: "in",
        data: {
          condition: {
            all: [
              {
                type: "var",
                varId: "mineFirst",
                op: "eq",
                value: 1
              }
            ]
          }
        }
      },
      {
        id: "e-bai-my",
        source: "b_ai",
        target: "a_my",
        sourceHandle: "default",
        targetHandle: "in"
      }
    ]
  },
  manifest: {
    version: "wb-game-video.blueprint-manifest.v1",
    mainPackId: "bp-main",
    packs: {
      "bp-main": {
        id: "bp-main",
        title: "\u4E3B\u84DD\u56FE",
        entry: "n_open",
        graph: {
          nodes: [
            {
              id: "n_open",
              type: "perf",
              position: {
                x: 40,
                y: 310
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u5E8F\u7AE0",
                durationMs: 15975,
                media: {
                  kind: "VIDEO",
                  ref: "narr-open"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_door",
              type: "perf",
              position: {
                x: 370,
                y: 310
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u6148\u60B2\u72F1\u95E8\u53E3",
                durationMs: 15100,
                media: {
                  kind: "VIDEO",
                  ref: "narr-door"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkKou",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "pass"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-door-pass"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "fail"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-door-fail"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "n_door",
                    removed: [
                      "inkKou-0"
                    ],
                    added: [
                      {
                        id: "kou",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          glyph: "\u53E9",
                          events: [
                            {
                              id: "pass",
                              label: "\u53E9\u4E2D"
                            },
                            {
                              id: "fail",
                              label: "\u9519\u8FC7"
                            }
                          ],
                          cues: [
                            {
                              id: "kou-0",
                              x: 0.58,
                              y: 0.39,
                              appearAt: 0,
                              targetAt: 1e3,
                              endAt: 6100
                            }
                          ],
                          timeoutMs: 6100,
                          defaultEvent: "fail"
                        },
                        component: "inkKou",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0,
                          endMs: 6100
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "n_soul",
              type: "perf",
              position: {
                x: 700,
                y: 270
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u5C0F\u9B42\u5BF9\u8BDD",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-soul"
                },
                overlayNodes: [
                  {
                    overlay: "base:dialogue",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "n_soul",
                    removed: [
                      "dialogue-0"
                    ],
                    added: [
                      {
                        id: "soul-line",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          speaker: "\u5C0F\u9B42",
                          text: "\u2026\u2026\u4F60\u4E5F\u662F\u6765\u6E21\u6CB3\u7684\u5417\uFF1F",
                          color: "#ffd54a"
                        },
                        component: "dialogue",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "n_river",
              type: "perf",
              position: {
                x: 1030,
                y: 310
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u5212\u8239\u6E21\u6CB3",
                durationMs: 15069,
                media: {
                  kind: "VIDEO",
                  ref: "narr-river"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkYingMo",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "ying"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-river-ying"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "mo"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-river-mo"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    overrides: {
                      "inkYingMo-0": {
                        trigger: {
                          when: "at",
                          ms: 12069
                        },
                        window: {
                          startMs: 12069
                        }
                      }
                    }
                  }
                ]
              }
            },
            {
              id: "n_child",
              type: "perf",
              position: {
                x: 1360,
                y: 270
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u5C0F\u5B69\u5BF9\u8BDD",
                durationMs: 12887,
                media: {
                  kind: "VIDEO",
                  ref: "narr-child"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_land",
              type: "perf",
              position: {
                x: 1690,
                y: 310
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u4E0A\u5CB8",
                durationMs: 16200,
                media: {
                  kind: "VIDEO",
                  ref: "narr-land"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkYingMo",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "ying"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-land-ying"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "mo"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-land-mo"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    overrides: {
                      "inkYingMo-0": {
                        trigger: {
                          when: "at",
                          ms: 13200
                        },
                        window: {
                          startMs: 13200
                        }
                      }
                    }
                  }
                ]
              }
            },
            {
              id: "n_mask",
              type: "perf",
              position: {
                x: 2020,
                y: 270
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u706F\u7B3C\u5BF9\u8BDD",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-mask"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_mengpo",
              type: "perf",
              position: {
                x: 2350,
                y: 310
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u8FC7\u6865\u89C1\u5B5F\u5A46",
                durationMs: 17136,
                media: {
                  kind: "VIDEO",
                  ref: "narr-mengpo"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_tea",
              type: "perf",
              position: {
                x: 2680,
                y: 310
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u559D\u5B5F\u5A46\u6C64",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-tea"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkYingMo",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "ying"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-tea-ying"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "mo"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-tea-mo"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    overrides: {
                      "inkYingMo-0": {
                        trigger: {
                          when: "at",
                          ms: 12093
                        },
                        window: {
                          startMs: 12093
                        }
                      }
                    }
                  }
                ]
              }
            },
            {
              id: "n_drink",
              type: "perf",
              position: {
                x: 3010,
                y: 440
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u996E\u6C64\u5E94\u7B54",
                durationMs: 14489,
                media: {
                  kind: "VIDEO",
                  ref: "narr-drink"
                },
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 0
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "drink-lizhi",
                            kind: "var",
                            varId: "lizhi",
                            op: "add",
                            value: -1
                          },
                          {
                            id: "drink-yezhang",
                            kind: "var",
                            varId: "yezhang",
                            op: "add",
                            value: 1
                          }
                        ]
                      }
                    ]
                  }
                ],
                overlayNodes: []
              }
            },
            {
              id: "n_nodrink",
              type: "perf",
              position: {
                x: 3010,
                y: 180
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u4E0D\u559D",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-nodrink"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkYingMo",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "ying"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-nodrink-ying"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "mo"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-nodrink-mo"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    overrides: {
                      "inkYingMo-0": {
                        trigger: {
                          when: "at",
                          ms: 12093
                        },
                        window: {
                          startMs: 12093
                        }
                      }
                    }
                  }
                ]
              }
            },
            {
              id: "n_follow",
              type: "perf",
              position: {
                x: 3340,
                y: 440
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u8DDF\u968F\u5F15\u9B42",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-follow"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkYingMo",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "ying"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-follow-ying"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "mo"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-follow-mo"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    overrides: {
                      "inkYingMo-0": {
                        trigger: {
                          when: "at",
                          ms: 12093
                        },
                        window: {
                          startMs: 12093
                        }
                      }
                    }
                  }
                ]
              }
            },
            {
              id: "n_getlight",
              type: "perf",
              position: {
                x: 3670,
                y: 460
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u83B7\u53D6\u9053\u5177",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-getlight"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_nolight",
              type: "perf",
              position: {
                x: 3670,
                y: 320
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u6CA1\u80FD\u9053\u5177",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-nolight"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_nofollow",
              type: "perf",
              position: {
                x: 3340,
                y: 160
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u4E0D\u8DDF\u968F",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-nofollow"
                },
                overlayNodes: [
                  {
                    overlay: "base:inkYingMo",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "ying"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-nofollow-ying"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "mo"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-nofollow-mo"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    overrides: {
                      "inkYingMo-0": {
                        trigger: {
                          when: "at",
                          ms: 12093
                        },
                        window: {
                          startMs: 12093
                        }
                      }
                    }
                  }
                ]
              }
            },
            {
              id: "n_lotus",
              type: "perf",
              position: {
                x: 3670,
                y: 180
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u63A5\u8FC7\u83B2\u85D5",
                durationMs: 15093,
                media: {
                  kind: "VIDEO",
                  ref: "narr-lotus"
                },
                overlayNodes: []
              }
            },
            {
              id: "n_nolotus",
              type: "perf",
              position: {
                x: 3670,
                y: 40
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u4E0D\u8981\u83B2\u85D5",
                durationMs: 15069,
                media: {
                  kind: "VIDEO",
                  ref: "narr-nolotus"
                },
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 0
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "nolotus-clue",
                            kind: "var",
                            varId: "lotusClue",
                            op: "set",
                            value: 1
                          }
                        ]
                      }
                    ]
                  }
                ],
                overlayNodes: []
              }
            },
            {
              id: "enter",
              type: "perf",
              position: {
                x: 4e3,
                y: 260
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u8FDB\u6218\u5F85\u673A",
                durationMs: 3e3,
                media: {
                  kind: "VIDEO",
                  ref: "idle01"
                },
                mediaPlayMode: "once",
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "complete",
                      if: {
                        all: [
                          {
                            type: "attrCompare",
                            left: "ent-player",
                            right: "ent-boss",
                            attr: "speed",
                            op: "gte"
                          }
                        ]
                      }
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "first-me",
                            kind: "var",
                            varId: "mineFirst",
                            op: "set",
                            value: 1
                          }
                        ]
                      }
                    ]
                  },
                  {
                    when: {
                      type: "complete"
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "first-foe",
                            kind: "var",
                            varId: "mineFirst",
                            op: "set",
                            value: 0
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "a_my",
              type: "perf",
              position: {
                x: 4330,
                y: 190
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u6211\u65B9\u56DE\u5408",
                durationMs: 0,
                subFlow: "wait"
              }
            },
            {
              id: "b_ai",
              type: "perf",
              position: {
                x: 4660,
                y: 280
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u654C\u65B9\u56DE\u5408",
                durationMs: 0,
                subFlow: "tele"
              }
            },
            {
              id: "wait",
              type: "perf",
              position: {
                x: 4330,
                y: 720
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u6218\u6597\u5F85\u673A",
                durationMs: 8e3,
                media: {
                  kind: "VIDEO",
                  ref: "idle01"
                },
                mediaPlayMode: "loop",
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:battleSkillBar",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "light"
                        },
                        do: [
                          {
                            kind: "effect",
                            effects: [
                              {
                                id: "sk-light-qi",
                                kind: "var",
                                varId: "qi",
                                op: "add",
                                value: 2
                              }
                            ]
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "heavy"
                        },
                        do: [
                          {
                            kind: "effect",
                            effects: [
                              {
                                id: "sk-heavy-qi",
                                kind: "var",
                                varId: "qi",
                                op: "add",
                                value: -2
                              }
                            ]
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "medit"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-sk-medit"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "ult"
                        },
                        do: [
                          {
                            kind: "effect",
                            effects: [
                              {
                                id: "sk-ult-qi",
                                kind: "var",
                                varId: "qi",
                                op: "set",
                                value: 0
                              }
                            ]
                          },
                          {
                            kind: "advance",
                            edgeId: "e-sk-ult"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "wait",
                    removed: [
                      "battleSkillBar-0"
                    ],
                    added: [
                      {
                        id: "skill",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          events: [
                            {
                              id: "light",
                              label: "\u8F7B\u653B\u51FB"
                            },
                            {
                              id: "heavy",
                              label: "\u91CD\u653B\u51FB",
                              condition: {
                                all: [
                                  {
                                    type: "var",
                                    varId: "qi",
                                    op: "gte",
                                    value: 2
                                  }
                                ]
                              }
                            },
                            {
                              id: "medit",
                              label: "\u51A5\u60F3"
                            },
                            {
                              id: "ult",
                              label: "\u706D\u4E16",
                              condition: {
                                all: [
                                  {
                                    type: "var",
                                    varId: "qi",
                                    op: "gte",
                                    value: 5
                                  },
                                  {
                                    type: "var",
                                    varId: "lizhi",
                                    op: "gte",
                                    value: 4
                                  }
                                ]
                              }
                            }
                          ],
                          x: 0.5,
                          y: 0.88
                        },
                        component: "battleSkillBar",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "pu",
              type: "perf",
              position: {
                x: 4660,
                y: 1070
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u8F7B\u653B\u51FB",
                durationMs: 5e3,
                media: {
                  kind: "VIDEO",
                  ref: "pugong"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "pu",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "pu-fx",
                        trigger: {
                          when: "at",
                          ms: 1e3
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-player.attr.attack)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 1e3
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 1e3
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "pu-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-floor(1 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * (0.85 + rand() * 0.3) * (1 + chance(0) * 0.5))",
                              pick: {
                                mode: "formula",
                                formulaId: "fx-dmg",
                                holeBindings: {
                                  h_mult: {
                                    kind: "number",
                                    value: 1
                                  },
                                  h_atk: {
                                    kind: "entityAttr",
                                    entityId: "ent-player",
                                    attr: "attack"
                                  },
                                  h_def: {
                                    kind: "entityAttr",
                                    entityId: "ent-boss",
                                    attr: "defense"
                                  },
                                  h_crit: {
                                    kind: "number",
                                    value: 0
                                  }
                                }
                              }
                            }
                          },
                          {
                            id: "pu-combo",
                            kind: "var",
                            varId: "combo",
                            op: "set",
                            value: 1
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "pu2",
              type: "perf",
              position: {
                x: 4660,
                y: 930
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u8F7B\u653B\u51FB\xB7\u53D8\u62DB",
                durationMs: 5e3,
                media: {
                  kind: "VIDEO",
                  ref: "pugong2"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "pu2",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "pu2-fx",
                        trigger: {
                          when: "at",
                          ms: 600
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-player.attr.attack * 13 / 10)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 600
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 600
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "pu2-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-floor(entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * ((0.25 * (var.combo == 1) + 0.3 * (var.combo == 2) + 0.35 * (var.combo == 3) + 0.4 * (var.combo == 4)) * (0.85 + rand() * 0.3)))",
                              pick: {
                                mode: "formula",
                                formulaId: "fx-dmg-combo",
                                holeBindings: {
                                  hc_atk: {
                                    kind: "entityAttr",
                                    entityId: "ent-player",
                                    attr: "attack"
                                  },
                                  hc_def: {
                                    kind: "entityAttr",
                                    entityId: "ent-boss",
                                    attr: "defense"
                                  }
                                }
                              }
                            }
                          },
                          {
                            id: "pu2-combo",
                            kind: "var",
                            varId: "combo",
                            op: "add",
                            value: 1
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "zhong",
              type: "perf",
              position: {
                x: 4660,
                y: 790
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u91CD\u653B\u51FB",
                durationMs: 6e3,
                media: {
                  kind: "VIDEO",
                  ref: "zhonggongji"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "zhong",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "zhong-fx",
                        trigger: {
                          when: "at",
                          ms: 1700
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-player.attr.attack * 18 / 10)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 1700
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 1700
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "zhong-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-floor(1.8 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * (0.85 + rand() * 0.3) * (1 + chance(0.05) * 0.5) * chance(0.95))",
                              pick: {
                                mode: "formula",
                                formulaId: "fx-dmg",
                                holeBindings: {
                                  h_mult: {
                                    kind: "number",
                                    value: 1.8
                                  },
                                  h_atk: {
                                    kind: "entityAttr",
                                    entityId: "ent-player",
                                    attr: "attack"
                                  },
                                  h_def: {
                                    kind: "entityAttr",
                                    entityId: "ent-boss",
                                    attr: "defense"
                                  },
                                  h_crit: {
                                    kind: "number",
                                    value: 0.05
                                  }
                                }
                              }
                            }
                          },
                          {
                            id: "zhong-crit",
                            kind: "var",
                            varId: "critRate",
                            op: "add",
                            value: 0.05
                          },
                          {
                            id: "zhong-break",
                            kind: "flag",
                            flagId: "boss-broken",
                            value: true
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "z2",
              type: "perf",
              position: {
                x: 4660,
                y: 650
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u91CD\u653B\u51FB\xB7\u53D8\u62DB",
                durationMs: 6e3,
                media: {
                  kind: "VIDEO",
                  ref: "zhonggongji2"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "z2",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "z2-fx",
                        trigger: {
                          when: "at",
                          ms: 2500
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-player.attr.attack * 24 / 10)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 2500
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 2500
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "z2-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-floor(entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * ((0.25 * (var.combo == 1) + 0.3 * (var.combo == 2) + 0.35 * (var.combo == 3) + 0.4 * (var.combo == 4)) * (0.85 + rand() * 0.3)))",
                              pick: {
                                mode: "formula",
                                formulaId: "fx-dmg-combo",
                                holeBindings: {
                                  hc_atk: {
                                    kind: "entityAttr",
                                    entityId: "ent-player",
                                    attr: "attack"
                                  },
                                  hc_def: {
                                    kind: "entityAttr",
                                    entityId: "ent-boss",
                                    attr: "defense"
                                  }
                                }
                              }
                            }
                          },
                          {
                            id: "z2-crit",
                            kind: "var",
                            varId: "critRate",
                            op: "add",
                            value: 0.05
                          },
                          {
                            id: "z2-break",
                            kind: "flag",
                            flagId: "boss-broken",
                            value: true
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "fuzhu",
              type: "perf",
              position: {
                x: 4660,
                y: 510
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u51A5\u60F3",
                durationMs: 5e3,
                media: {
                  kind: "VIDEO",
                  ref: "huiqi"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "fuzhu",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "fuzhu-fx",
                        trigger: {
                          when: "at",
                          ms: 2e3
                        },
                        inputs: {
                          text: "+30",
                          x: 0.5,
                          y: 0.42,
                          color: "#5fbf7f"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 2e3
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 2e3
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "fuzhu-heal",
                            kind: "attr",
                            entityId: "ent-player",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "floor(entity.ent-player.attr.hpMax * 0.12)",
                              pick: {
                                mode: "formula",
                                formulaId: "fx-heal",
                                holeBindings: {
                                  hh_max: {
                                    kind: "entityAttr",
                                    entityId: "ent-player",
                                    attr: "hpMax"
                                  }
                                }
                              }
                            }
                          },
                          {
                            id: "fuzhu-qi",
                            kind: "var",
                            varId: "qi",
                            op: "add",
                            value: 2
                          },
                          {
                            id: "fuzhu-cd",
                            kind: "var",
                            varId: "healCd",
                            op: "set",
                            value: 3
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "ult",
              type: "perf",
              position: {
                x: 4660,
                y: 370
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u706D\u4E16",
                durationMs: 12e3,
                media: {
                  kind: "VIDEO",
                  ref: "dazhao"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "ult",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "ult-fx",
                        trigger: {
                          when: "at",
                          ms: 7e3
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-player.attr.attack * 3)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 7e3
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 7e3
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "ult-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-floor(3 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense) * (0.85 + rand() * 0.3) * (1 + chance(0.05) * 0.5))",
                              pick: {
                                mode: "formula",
                                formulaId: "fx-dmg",
                                holeBindings: {
                                  h_mult: {
                                    kind: "number",
                                    value: 3
                                  },
                                  h_atk: {
                                    kind: "entityAttr",
                                    entityId: "ent-player",
                                    attr: "attack"
                                  },
                                  h_def: {
                                    kind: "entityAttr",
                                    entityId: "ent-boss",
                                    attr: "defense"
                                  },
                                  h_crit: {
                                    kind: "number",
                                    value: 0.05
                                  }
                                }
                              }
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "tele",
              type: "perf",
              position: {
                x: 4660,
                y: 600
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u653B\u51FB\u524D\u6447\xB7\u9632\u53CDQTE",
                durationMs: 4e3,
                media: {
                  kind: "VIDEO",
                  ref: "difanggongjiqianyao"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:battleParry",
                    reactions: [
                      {
                        when: {
                          type: "event",
                          id: "pass"
                        },
                        do: [
                          {
                            kind: "advance",
                            edgeId: "e-tele-pass"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "good"
                        },
                        do: [
                          {
                            kind: "effect",
                            effects: [
                              {
                                id: "dodge-qi",
                                kind: "var",
                                varId: "qi",
                                op: "add",
                                value: -1
                              }
                            ]
                          },
                          {
                            kind: "advance",
                            edgeId: "e-tele-good"
                          }
                        ]
                      },
                      {
                        when: {
                          type: "event",
                          id: "fail"
                        },
                        do: [
                          {
                            kind: "effect",
                            effects: [
                              {
                                id: "hurt-qi",
                                kind: "var",
                                varId: "qi",
                                op: "add",
                                value: 1
                              }
                            ]
                          },
                          {
                            kind: "advance",
                            edgeId: "e-tele-fail"
                          }
                        ]
                      }
                    ],
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "tele",
                    removed: [
                      "battleParry-0"
                    ],
                    added: [
                      {
                        id: "parry",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          qteKind: "parry",
                          durationMs: 2600,
                          events: [
                            {
                              id: "pass",
                              label: "\u53D7\u51FB\u9632\u53CD"
                            },
                            {
                              id: "good",
                              label: "\u53D7\u51FB\u95EA\u907F"
                            },
                            {
                              id: "fail",
                              label: "\u53D7\u51FB"
                            }
                          ],
                          defaultEvent: "fail",
                          cues: [
                            {
                              id: "parry-0",
                              appearAt: 0,
                              targetAt: 1300,
                              endAt: 2600
                            }
                          ]
                        },
                        component: "battleParry",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0,
                          endMs: 2600
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "block",
              type: "perf",
              position: {
                x: 4990,
                y: 740
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u53D7\u51FB\u9632\u53CD",
                durationMs: 4e3,
                media: {
                  kind: "VIDEO",
                  ref: "fangfan"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "block",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "block-fx",
                        trigger: {
                          when: "at",
                          ms: 1800
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-boss.attr.attack + var.yezhang * 21)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 1800
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 1800
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "block-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-(entity.ent-boss.attr.attack + var.yezhang * 21)"
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "dodgeP",
              type: "perf",
              position: {
                x: 4990,
                y: 600
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u53D7\u51FB\u95EA\u907F",
                durationMs: 4e3,
                media: {
                  kind: "VIDEO",
                  ref: "shanbi"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "dodgeP",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "dodgeP-fx",
                        trigger: {
                          when: "at",
                          ms: 2e3
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ffd54a",
                          expr: "-(entity.ent-boss.attr.attack - entity.ent-player.attr.defense / 4)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 2e3
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 2e3
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "dodge-dmg",
                            kind: "attr",
                            entityId: "ent-boss",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-(entity.ent-boss.attr.attack - entity.ent-player.attr.defense / 4)"
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "hurt",
              type: "perf",
              position: {
                x: 4990,
                y: 460
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u53D7\u51FB",
                durationMs: 4e3,
                media: {
                  kind: "VIDEO",
                  ref: "shouji"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  },
                  {
                    overlay: "base:floatText",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "hurt",
                    removed: [
                      "floatText-0"
                    ],
                    added: [
                      {
                        id: "hurt-fx",
                        trigger: {
                          when: "at",
                          ms: 10
                        },
                        inputs: {
                          text: "{v}",
                          x: 0.5,
                          y: 0.42,
                          color: "#ff5a5a",
                          expr: "-(entity.ent-boss.attr.attack + var.yezhang * 45)"
                        },
                        component: "floatText",
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 10
                        }
                      }
                    ]
                  }
                ],
                reactions: [
                  {
                    when: {
                      type: "at",
                      ms: 10
                    },
                    do: [
                      {
                        kind: "effect",
                        effects: [
                          {
                            id: "hurt-dmg",
                            kind: "attr",
                            entityId: "ent-player",
                            attr: "hp",
                            op: "add",
                            value: {
                              expr: "-(entity.ent-boss.attr.attack + var.yezhang * 45)"
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "win",
              type: "perf",
              position: {
                x: 4990,
                y: 140
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u6218\u6597\u80DC\u5229",
                durationMs: 1e4,
                media: {
                  kind: "VIDEO",
                  ref: "shengli"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              id: "lose",
              type: "perf",
              position: {
                x: 4990,
                y: 280
              },
              inputs: [],
              outputs: [],
              data: {
                name: "\u6218\u6597\u5931\u8D25",
                durationMs: 6e3,
                media: {
                  kind: "VIDEO",
                  ref: "shibai"
                },
                overlayNodes: [
                  {
                    overlay: "base:battleHpBar",
                    layout: {
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1
                    },
                    id: "battleHud",
                    removed: [
                      "battleHpBar-0"
                    ],
                    added: [
                      {
                        id: "playerHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-player",
                          label: "\u7A7A\u85CF"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      },
                      {
                        id: "bossHp",
                        component: "battleHpBar",
                        trigger: {
                          when: "enter"
                        },
                        inputs: {
                          bind: "ent-boss",
                          label: "\u5C0F\u602A"
                        },
                        layout: {
                          left: 0,
                          top: 0,
                          width: 1,
                          height: 1
                        },
                        window: {
                          startMs: 0
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ],
          edges: [
            {
              id: "e-open",
              source: "n_open",
              target: "n_door",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-door-pass",
              source: "n_door",
              target: "n_soul",
              sourceHandle: "pass",
              targetHandle: "in"
            },
            {
              id: "e-door-fail",
              source: "n_door",
              target: "n_river",
              sourceHandle: "fail",
              targetHandle: "in"
            },
            {
              id: "e-soul",
              source: "n_soul",
              target: "n_river",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-river-ying",
              source: "n_river",
              target: "n_child",
              sourceHandle: "ying",
              targetHandle: "in"
            },
            {
              id: "e-river-mo",
              source: "n_river",
              target: "n_land",
              sourceHandle: "mo",
              targetHandle: "in"
            },
            {
              id: "e-child",
              source: "n_child",
              target: "n_land",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-land-ying",
              source: "n_land",
              target: "n_mask",
              sourceHandle: "ying",
              targetHandle: "in"
            },
            {
              id: "e-land-mo",
              source: "n_land",
              target: "n_mengpo",
              sourceHandle: "mo",
              targetHandle: "in"
            },
            {
              id: "e-mask",
              source: "n_mask",
              target: "n_mengpo",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-mengpo",
              source: "n_mengpo",
              target: "n_tea",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-tea-ying",
              source: "n_tea",
              target: "n_drink",
              sourceHandle: "ying",
              targetHandle: "in"
            },
            {
              id: "e-tea-mo",
              source: "n_tea",
              target: "n_nodrink",
              sourceHandle: "mo",
              targetHandle: "in"
            },
            {
              id: "e-drink",
              source: "n_drink",
              target: "n_follow",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-nodrink-ying",
              source: "n_nodrink",
              target: "n_follow",
              sourceHandle: "ying",
              targetHandle: "in"
            },
            {
              id: "e-nodrink-mo",
              source: "n_nodrink",
              target: "n_nofollow",
              sourceHandle: "mo",
              targetHandle: "in"
            },
            {
              id: "e-follow-ying",
              source: "n_follow",
              target: "n_getlight",
              sourceHandle: "ying",
              targetHandle: "in"
            },
            {
              id: "e-follow-mo",
              source: "n_follow",
              target: "n_nolight",
              sourceHandle: "mo",
              targetHandle: "in"
            },
            {
              id: "e-getlight",
              source: "n_getlight",
              target: "enter",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-nolight",
              source: "n_nolight",
              target: "enter",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-nofollow-ying",
              source: "n_nofollow",
              target: "n_lotus",
              sourceHandle: "ying",
              targetHandle: "in"
            },
            {
              id: "e-nofollow-mo",
              source: "n_nofollow",
              target: "n_nolotus",
              sourceHandle: "mo",
              targetHandle: "in"
            },
            {
              id: "e-lotus",
              source: "n_lotus",
              target: "enter",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-nolotus",
              source: "n_nolotus",
              target: "enter",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-init-me",
              source: "enter",
              target: "a_my",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "attrCompare",
                      left: "ent-player",
                      right: "ent-boss",
                      attr: "speed",
                      op: "gte"
                    }
                  ]
                }
              }
            },
            {
              id: "e-init-foe",
              source: "enter",
              target: "b_ai",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-sk-light",
              source: "wait",
              target: "pu",
              sourceHandle: "light",
              targetHandle: "in",
              data: {
                weight: 1
              }
            },
            {
              id: "e-sk-light2",
              source: "wait",
              target: "pu2",
              sourceHandle: "light",
              targetHandle: "in",
              data: {
                weight: 1
              }
            },
            {
              id: "e-sk-heavy",
              source: "wait",
              target: "zhong",
              sourceHandle: "heavy",
              targetHandle: "in",
              data: {
                weight: 1
              }
            },
            {
              id: "e-sk-heavy2",
              source: "wait",
              target: "z2",
              sourceHandle: "heavy",
              targetHandle: "in",
              data: {
                weight: 1
              }
            },
            {
              id: "e-sk-medit",
              source: "wait",
              target: "fuzhu",
              sourceHandle: "medit",
              targetHandle: "in"
            },
            {
              id: "e-sk-ult",
              source: "wait",
              target: "ult",
              sourceHandle: "ult",
              targetHandle: "in"
            },
            {
              id: "e-tele-pass",
              source: "tele",
              target: "block",
              sourceHandle: "pass",
              targetHandle: "in"
            },
            {
              id: "e-tele-good",
              source: "tele",
              target: "dodgeP",
              sourceHandle: "good",
              targetHandle: "in"
            },
            {
              id: "e-tele-fail",
              source: "tele",
              target: "hurt",
              sourceHandle: "fail",
              targetHandle: "in"
            },
            {
              id: "e-amy-win",
              source: "a_my",
              target: "win",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "attrRatio",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "lte",
                      value: 0
                    }
                  ]
                }
              }
            },
            {
              id: "e-amy-subflow-entry",
              source: "a_my",
              target: "wait",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "score",
                      op: "lt",
                      value: 0
                    }
                  ]
                }
              }
            },
            {
              id: "e-amy-lose",
              source: "a_my",
              target: "lose",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "attrRatio",
                      entityId: "ent-player",
                      attr: "hp",
                      op: "lte",
                      value: 0
                    }
                  ]
                }
              }
            },
            {
              id: "e-amy-foe",
              source: "a_my",
              target: "b_ai",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "var",
                      varId: "mineFirst",
                      op: "eq",
                      value: 1
                    }
                  ]
                }
              }
            },
            {
              id: "e-amy-loop",
              source: "a_my",
              target: "enter",
              sourceHandle: "default",
              targetHandle: "in"
            },
            {
              id: "e-bai-win",
              source: "b_ai",
              target: "win",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "attrRatio",
                      entityId: "ent-boss",
                      attr: "hp",
                      op: "lte",
                      value: 0
                    }
                  ]
                }
              }
            },
            {
              id: "e-bai-subflow-entry",
              source: "b_ai",
              target: "tele",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "score",
                      op: "lt",
                      value: 0
                    }
                  ]
                }
              }
            },
            {
              id: "e-bai-lose",
              source: "b_ai",
              target: "lose",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "attrRatio",
                      entityId: "ent-player",
                      attr: "hp",
                      op: "lte",
                      value: 0
                    }
                  ]
                }
              }
            },
            {
              id: "e-bai-loop",
              source: "b_ai",
              target: "enter",
              sourceHandle: "default",
              targetHandle: "in",
              data: {
                condition: {
                  all: [
                    {
                      type: "var",
                      varId: "mineFirst",
                      op: "eq",
                      value: 1
                    }
                  ]
                }
              }
            },
            {
              id: "e-bai-my",
              source: "b_ai",
              target: "a_my",
              sourceHandle: "default",
              targetHandle: "in"
            }
          ]
        }
      }
    }
  }
};

// server/host/fixtures/nodia.assets.json
var nodia_assets_default = {
  version: 2,
  assets: [
    {
      id: "dazhao",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/dazhao.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "difanggongjiqianyao",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/difanggongjiqianyao.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "fangfan",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/fangfan.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "huiqi",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/huiqi.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "idle01",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/idle01.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-child",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-child.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-door",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-door.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-drink",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-drink.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-follow",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-follow.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-getlight",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-getlight.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-land",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-land.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-lotus",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-lotus.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-mask",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-mask.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-mengpo",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-mengpo.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-nodrink",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-nodrink.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-nofollow",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-nofollow.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-nolight",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-nolight.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-nolotus",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-nolotus.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-open",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-open.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-river",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-river.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-soul",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-soul.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "narr-tea",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/narr-tea.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "pugong",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/pugong.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "pugong2",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/pugong2.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "qinggongjizhisi",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/qinggongjizhisi.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "shanbi",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/shanbi.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "shengli",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/shengli.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "shibai",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/shibai.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "shouji",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/shouji.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "zhonggongji",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/zhonggongji.mp4",
        mime: "video/mp4"
      }
    },
    {
      id: "zhonggongji2",
      kind: "video",
      productionType: "bundled_video",
      status: "ready",
      file: {
        provider: "extension",
        key: "zhandou/zhonggongji2.mp4",
        mime: "video/mp4"
      }
    }
  ]
};

// server/host/nodia-assets.ts
var NODIA_ASSETS_MANIFEST = nodia_assets_default;

// server/host/nodia-seed.ts
var NODIA_PROJECT = {
  id: "nodia",
  title: "Nodia",
  platform: "wb-game-video",
  platformVersion: "1",
  entry: {
    blueprint: "blueprint.json",
    components: "dist/components"
  }
};
var UNSAFE_SEED_VALUE = /\/Users\/|\/workspace\/|\.forgeax\/games|file:\/\//;
var BASENAME_ID = /^[^/\\.\0]+$/;
async function createNodiaSeed() {
  return structuredClone({
    project: NODIA_PROJECT,
    blueprint: nodia_blueprint_default,
    assetsManifest: NODIA_ASSETS_MANIFEST
  });
}
function assert(condition, message2) {
  if (!condition) throw new Error(`Invalid Nodia seed: ${message2}`);
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function assertPortable(value, at = "seed") {
  if (typeof value === "string") {
    assert(!UNSAFE_SEED_VALUE.test(value), `${at} contains a machine or game path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPortable(item, `${at}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) assertPortable(item, `${at}.${key}`);
  }
}
function validateProject(project) {
  assert(isRecord(project), "project must be an object");
  assert(project.id === "nodia", "project.id must be nodia");
  assert(project.title === "Nodia", "project.title must be Nodia");
  assert(project.platform === "wb-game-video", "project.platform must be wb-game-video");
  assert(project.platformVersion === "1", "project.platformVersion must be 1");
  assert(isRecord(project.entry), "project.entry must be an object");
  assert(project.entry.blueprint === "blueprint.json", "project.entry.blueprint must be blueprint.json");
  assert(project.entry.components === "dist/components", "project.entry.components must be dist/components");
}
function validateAssets(manifest) {
  assert(isRecord(manifest), "assets manifest must be an object");
  assert(manifest.version === 2, "assets manifest.version must be 2");
  assert(Array.isArray(manifest.assets), "assets manifest.assets must be an array");
  assert(manifest.assets.length === 31, "assets manifest must contain exactly 31 bundled videos");
  const ids = /* @__PURE__ */ new Set();
  for (const [index, asset] of manifest.assets.entries()) {
    assert(isRecord(asset), `assets[${index}] must be an object`);
    assert(typeof asset.id === "string" && BASENAME_ID.test(asset.id), `assets[${index}].id must be basename-only`);
    assert(!ids.has(asset.id), `duplicate asset id '${asset.id}'`);
    ids.add(asset.id);
    assert(asset.kind === "video", `assets[${index}].kind must be video`);
    assert(asset.productionType === "bundled_video", `assets[${index}].productionType must be bundled_video`);
    assert(asset.status === "ready", `assets[${index}].status must be ready`);
    assert(isRecord(asset.file), `assets[${index}].file must be an object`);
    assert(asset.file.provider === "extension", `assets[${index}].file.provider must be extension`);
    assert(asset.file.key === `zhandou/${asset.id}.mp4`, `assets[${index}].file.key must match the logical id`);
    assert(asset.file.mime === "video/mp4", `assets[${index}].file.mime must be video/mp4`);
  }
}
function collectMediaRefs(value, refs, at) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectMediaRefs(item, refs, `${at}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  if (isRecord(value.media) && Object.prototype.hasOwnProperty.call(value.media, "ref")) {
    const ref = value.media.ref;
    assert(typeof ref === "string" && ref.trim().length > 0, `${at}.media.ref must be a nonempty string logical id`);
    refs.push({ ref, at: `${at}.media.ref` });
  }
  for (const [key, item] of Object.entries(value)) collectMediaRefs(item, refs, `${at}.${key}`);
}
function subFlowPackId(value) {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "subFlowPack")) return void 0;
  assert(isRecord(value.subFlowPack), "subFlowPack must be an object");
  const id = value.subFlowPack.id;
  assert(typeof id === "string" && id.trim().length > 0, "subFlowPack.id must be a nonempty string");
  if (value.subFlowPack.version !== void 0) {
    assert(
      typeof value.subFlowPack.version === "string" && value.subFlowPack.version.trim().length > 0,
      "subFlowPack.version must be a nonempty string when present"
    );
  }
  if (value.subFlowPack.entry !== void 0) {
    assert(
      typeof value.subFlowPack.entry === "string" && value.subFlowPack.entry.trim().length > 0,
      "subFlowPack.entry must be a nonempty string when present"
    );
  }
  return id;
}
function validateBlueprint(blueprint, assetIds) {
  assert(isRecord(blueprint), "blueprint must be an object");
  assert(blueprint.version === "wb-game-video.graph.v1", "blueprint.version is invalid");
  assert(isRecord(blueprint.graph), "blueprint.graph must be an object");
  assert(isRecord(blueprint.manifest), "blueprint.manifest must be an object");
  const manifest = blueprint.manifest;
  assert(manifest.version === "wb-game-video.blueprint-manifest.v1", "blueprint manifest.version is invalid");
  assert(typeof manifest.mainPackId === "string" && manifest.mainPackId.length > 0, "blueprint manifest.mainPackId is required");
  assert(isRecord(manifest.packs), "blueprint manifest.packs must be an object");
  assert(isRecord(manifest.packs[manifest.mainPackId]), "blueprint main pack is missing");
  const packIds = /* @__PURE__ */ new Set();
  const packReferences = /* @__PURE__ */ new Map();
  for (const [packId, rawPack] of Object.entries(manifest.packs)) {
    assert(!packIds.has(packId), `duplicate pack id '${packId}'`);
    packIds.add(packId);
    assert(isRecord(rawPack), `pack '${packId}' must be an object`);
    assert(rawPack.id === packId, `pack '${packId}' id must match its manifest key`);
    assert(typeof rawPack.entry === "string" && rawPack.entry.length > 0, `pack '${packId}' entry is required`);
    assert(isRecord(rawPack.graph), `pack '${packId}' graph must be an object`);
    assert(Array.isArray(rawPack.graph.nodes) && Array.isArray(rawPack.graph.edges), `pack '${packId}' graph is invalid`);
    const nodeIds = /* @__PURE__ */ new Set();
    for (const [index, node] of rawPack.graph.nodes.entries()) {
      assert(isRecord(node) && typeof node.id === "string" && node.id.length > 0, `pack '${packId}' node ${index} has no id`);
      assert(!nodeIds.has(node.id), `pack '${packId}' has duplicate node id '${node.id}'`);
      nodeIds.add(node.id);
    }
    assert(nodeIds.has(rawPack.entry), `pack '${packId}' entry '${rawPack.entry}' does not exist`);
    const edgeIds = /* @__PURE__ */ new Set();
    const adjacency = /* @__PURE__ */ new Map();
    for (const [index, edge] of rawPack.graph.edges.entries()) {
      assert(isRecord(edge) && typeof edge.id === "string" && edge.id.length > 0, `pack '${packId}' edge ${index} has no id`);
      assert(!edgeIds.has(edge.id), `pack '${packId}' has duplicate edge id '${edge.id}'`);
      edgeIds.add(edge.id);
      assert(typeof edge.source === "string" && nodeIds.has(edge.source), `pack '${packId}' edge '${edge.id}' has an unknown source`);
      assert(typeof edge.target === "string" && nodeIds.has(edge.target), `pack '${packId}' edge '${edge.id}' has an unknown target`);
      const targets = adjacency.get(edge.source) ?? [];
      targets.push(edge.target);
      adjacency.set(edge.source, targets);
    }
    const visited = /* @__PURE__ */ new Set([rawPack.entry]);
    const pending = [rawPack.entry];
    while (pending.length > 0) {
      const current = pending.shift();
      for (const target of adjacency.get(current) ?? []) {
        if (!visited.has(target)) {
          visited.add(target);
          pending.push(target);
        }
      }
    }
    const unreachable = [...nodeIds].find((nodeId) => !visited.has(nodeId));
    assert(!unreachable, `pack '${packId}' has unreachable node '${unreachable}' from entry '${rawPack.entry}'`);
    for (const node of rawPack.graph.nodes) {
      const packRefId = isRecord(node) ? subFlowPackId(node.data) : void 0;
      assert(!packRefId || isRecord(manifest.packs[packRefId]), `pack '${packId}' references missing subflow '${packRefId}'`);
      if (packRefId) {
        const references2 = packReferences.get(packId) ?? [];
        references2.push(packRefId);
        packReferences.set(packId, references2);
      }
    }
  }
  const visiting = /* @__PURE__ */ new Set();
  const visitedPacks = /* @__PURE__ */ new Set();
  const traversePack = (packId) => {
    if (visiting.has(packId)) throw new Error(`Invalid Nodia seed: subflow reference cycle at '${packId}'`);
    if (visitedPacks.has(packId)) return;
    visiting.add(packId);
    for (const next of packReferences.get(packId) ?? []) traversePack(next);
    visiting.delete(packId);
    visitedPacks.add(packId);
  };
  for (const packId of packIds) traversePack(packId);
  assert(
    JSON.stringify(blueprint.graph) === JSON.stringify(manifest.packs[manifest.mainPackId].graph),
    "blueprint.graph must mirror the main pack graph"
  );
  const refs = [];
  collectMediaRefs(blueprint, refs, "blueprint");
  for (const { ref, at } of refs) assert(assetIds.has(ref), `${at} '${ref}' is not in the seeded asset manifest`);
}
function validateNodiaSeed(seed) {
  assert(isRecord(seed), "seed must be an object");
  assertPortable(seed);
  validateProject(seed.project);
  validateAssets(seed.assetsManifest);
  validateBlueprint(seed.blueprint, new Set(seed.assetsManifest.assets.map((asset) => asset.id)));
}

// server/asset-registry.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, statSync, renameSync } from "fs";
import { createHash } from "crypto";
import { extname, isAbsolute, relative, resolve, sep } from "path";
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isMediaAsset(value) {
  return isRecord2(value) && typeof value.id === "string" && (value.kind === "image" || value.kind === "video") && typeof value.productionType === "string";
}
function isProviderBacked(value) {
  return isRecord2(value) && isRecord2(value.provider);
}
function normalizeMediaAsset(value) {
  if (!isMediaAsset(value)) return null;
  const source = value;
  const providerBacked = isProviderBacked(source);
  return {
    ...source,
    label: source.label ?? (typeof source.name === "string" ? source.name : void 0),
    mime: source.mime ?? (typeof source.mimeType === "string" ? source.mimeType : void 0),
    meta: providerBacked ? { ...source.meta ?? {}, upload: true } : source.meta
  };
}
function validateAssetRecords(assets) {
  const ids = /* @__PURE__ */ new Set();
  for (const asset of assets) {
    if (!isRecord2(asset)) throw new Error("Invalid shared asset manifest record");
    if (typeof asset.id !== "string" || asset.id.length === 0 || typeof asset.kind !== "string" || asset.kind.length === 0 || ids.has(asset.id)) {
      throw new Error("Invalid or duplicate shared asset id");
    }
    ids.add(asset.id);
  }
}
var MIME_BY_EXT = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
function mimeForPath(p) {
  return MIME_BY_EXT[extname(p).toLowerCase()] ?? "application/octet-stream";
}
var HOST_MANIFEST_PATH = "assets/manifest.json";
var HOST_MANIFEST_LOCK = "wb-game-video-assets-manifest";
var HOST_RECLAIM_JOURNAL_KEY = "wbGameVideoReclaims";
var HOST_MEDIA_INTENT_JOURNAL_KEY = "wbGameVideoMediaIntents";
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
function assertBoundedRelativePath(value, label = "Game file path") {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError(`${label} must be a bounded relative path`);
  }
  return normalized;
}
async function readHostManifest(files) {
  const bytes = await files.read(HOST_MANIFEST_PATH);
  if (!bytes) return { version: 2, assets: [] };
  let parsed;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new Error("Invalid shared asset manifest JSON", { cause: error });
  }
  if (parsed.version !== 2 || !Array.isArray(parsed.assets)) {
    throw new Error("Unsupported shared asset manifest");
  }
  validateAssetRecords(parsed.assets);
  const manifest = { ...parsed, version: 2, assets: parsed.assets };
  hostMediaReclaims(manifest);
  hostMediaIntents(manifest);
  return manifest;
}
async function writeHostManifest(files, manifest) {
  validateAssetRecords(manifest.assets);
  hostMediaReclaims(manifest);
  hostMediaIntents(manifest);
  await files.write(
    HOST_MANIFEST_PATH,
    textEncoder.encode(`${JSON.stringify({ ...manifest, version: 2 }, null, 2)}
`)
  );
}
function isHostReclaimSource(value) {
  return value === "wb-game-video-reference" || value === "wb-game-video-generation" || value === "wb-game-video-model-output";
}
function isHostPersistedMediaSource(value) {
  return value === "wb-game-video-reference" || value === "wb-game-video-generation";
}
function hostMediaReclaims(manifest) {
  const value = manifest[HOST_RECLAIM_JOURNAL_KEY];
  if (value === void 0) return [];
  if (!isRecord2(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    throw new Error("Invalid wb-game-video media reclaim journal");
  }
  const seenAssets = /* @__PURE__ */ new Set();
  return value.entries.map((entry) => {
    if (!isRecord2(entry) || typeof entry.registryId !== "string" || entry.registryId.length === 0 || typeof entry.assetId !== "string" || entry.assetId.length === 0 || !isHostReclaimSource(entry.source) || entry.operationId !== null && (typeof entry.operationId !== "string" || entry.operationId.length === 0) || (entry.source === "wb-game-video-model-output" ? typeof entry.operationId !== "string" || typeof entry.fingerprint !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.fingerprint) : entry.fingerprint !== void 0) || seenAssets.has(entry.assetId)) {
      throw new Error("Invalid wb-game-video media reclaim journal");
    }
    seenAssets.add(entry.assetId);
    return {
      registryId: entry.registryId,
      assetId: entry.assetId,
      source: entry.source,
      operationId: entry.operationId,
      ...typeof entry.fingerprint === "string" ? { fingerprint: entry.fingerprint } : {}
    };
  });
}
function hostMediaIntents(manifest) {
  const value = manifest[HOST_MEDIA_INTENT_JOURNAL_KEY];
  if (value === void 0) return [];
  if (!isRecord2(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    throw new Error("Invalid wb-game-video media intent journal");
  }
  const seenRegistries = /* @__PURE__ */ new Set();
  return value.entries.map((entry) => {
    if (!isRecord2(entry) || typeof entry.registryId !== "string" || entry.registryId.length === 0 || !isHostPersistedMediaSource(entry.source) || typeof entry.operationId !== "string" || entry.operationId.length === 0 || seenRegistries.has(`${entry.source}\0${entry.registryId}`)) {
      throw new Error("Invalid wb-game-video media intent journal");
    }
    seenRegistries.add(`${entry.source}\0${entry.registryId}`);
    return {
      registryId: entry.registryId,
      source: entry.source,
      operationId: entry.operationId
    };
  });
}
function withHostMediaReclaims(manifest, entries) {
  const next = { ...manifest };
  if (entries.length === 0) {
    delete next[HOST_RECLAIM_JOURNAL_KEY];
  } else {
    const journal = {
      version: 1,
      entries: entries.map((entry) => ({ ...entry }))
    };
    next[HOST_RECLAIM_JOURNAL_KEY] = journal;
  }
  return next;
}
function withHostMediaIntents(manifest, entries) {
  const next = { ...manifest };
  if (entries.length === 0) {
    delete next[HOST_MEDIA_INTENT_JOURNAL_KEY];
  } else {
    const journal = {
      version: 1,
      entries: entries.map((entry) => ({ ...entry }))
    };
    next[HOST_MEDIA_INTENT_JOURNAL_KEY] = journal;
  }
  return next;
}
function declaredHostMediaId(normalized) {
  const hostMedia = isRecord2(normalized.meta?.hostMedia) ? normalized.meta.hostMedia : void 0;
  return hostMedia?.provenance === "workbench-media-capability" && typeof hostMedia.assetId === "string" && normalized.provider?.kind === "local" && normalized.provider.ref === hostMedia.assetId ? hostMedia.assetId : void 0;
}
function trustedHostMediaId(normalized, trustedMedia) {
  const hostAssetId = declaredHostMediaId(normalized);
  return hostAssetId && trustedMedia.has(hostAssetId) ? hostAssetId : void 0;
}
function reclaimForHostMedia(registryId, asset) {
  if (!asset || !isRecord2(asset.metadata)) return void 0;
  const { source, operationId } = asset.metadata;
  if (asset.metadata.registryId !== registryId || !isHostPersistedMediaSource(source) || operationId !== void 0 && (typeof operationId !== "string" || operationId.length === 0)) {
    return void 0;
  }
  return {
    registryId,
    assetId: asset.id,
    source,
    operationId: operationId ?? null
  };
}
function sameHostMediaIntent(left, right) {
  return left.registryId === right.registryId && left.source === right.source && left.operationId === right.operationId;
}
function matchesHostMediaIntent(intent, asset) {
  return isRecord2(asset.metadata) && asset.metadata.registryId === intent.registryId && asset.metadata.source === intent.source && asset.metadata.operationId === intent.operationId;
}
function sameHostMediaReclaim(left, right) {
  return left.registryId === right.registryId && left.assetId === right.assetId && left.source === right.source && left.operationId === right.operationId && left.fingerprint === right.fingerprint;
}
function enqueueHostMediaReclaim(manifest, reclaim) {
  const entries = hostMediaReclaims(manifest);
  const existing = entries.find((entry) => entry.assetId === reclaim.assetId);
  if (existing) {
    if (!sameHostMediaReclaim(existing, reclaim)) {
      throw new Error("Conflicting wb-game-video media reclaim journal entry");
    }
    return manifest;
  }
  return withHostMediaReclaims(manifest, [...entries, reclaim]);
}
function publicHostAsset(value, trustedMedia) {
  const normalized = normalizeMediaAsset(value);
  if (!normalized) return null;
  const { label, prompt, error, meta } = normalized;
  const hostAssetId = trustedHostMediaId(normalized, trustedMedia);
  const authoritativeMedia = hostAssetId ? trustedMedia.get(hostAssetId) : void 0;
  const trustedLocator = authoritativeMedia && authoritativeMedia.url === normalized.url ? safeHostMediaUrl(authoritativeMedia.url) : void 0;
  const sanitizedMeta = deepSanitizeMeta(
    meta,
    trustedLocator,
    trustedLocator ? hostAssetId : void 0
  );
  return {
    id: normalized.id,
    kind: normalized.kind,
    productionType: normalized.productionType,
    status: normalized.status,
    ...label ? { label: sanitizePublicText(label) } : {},
    ...prompt ? { prompt: sanitizePublicText(prompt) } : {},
    ...normalized.sceneNodeId ? {
      sceneNodeId: sanitizePublicText(normalized.sceneNodeId)
    } : {},
    ...normalized.sourceModule ? {
      sourceModule: sanitizePublicText(normalized.sourceModule)
    } : {},
    ...normalized.mime ? { mime: normalized.mime } : {},
    ...normalized.bytes !== void 0 ? { bytes: normalized.bytes } : {},
    ...normalized.durationMs !== void 0 ? { durationMs: normalized.durationMs } : {},
    ...error ? { error: sanitizePublicText(error) } : {},
    ...trustedLocator ? { url: trustedLocator } : {},
    ...sanitizedMeta ? { meta: sanitizedMeta } : {},
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}
function sanitizePublicText(value) {
  return value.replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g, "[redacted]").replace(/\b(?:file|javascript|data|vbscript|blob):\S+/gi, "[redacted]").replace(/\\\\[^\s]+/g, "[redacted]").replace(/[A-Za-z]:[\\/][^\s]+/g, "[redacted]").replace(
    /(^|[^A-Za-z0-9._-])\/[^\s,;)\]}"']+/g,
    (_match, prefix) => `${prefix}[redacted]`
  ).slice(0, 4e3);
}
function containsSensitivePublicText(value) {
  return sanitizePublicText(value) !== value;
}
function deepSanitizeMeta(value, trustedLocator, trustedAssetId) {
  if (!isRecord2(value)) return void 0;
  const out = {};
  for (const [childKey, child] of Object.entries(value)) {
    if (/^(?:externalPath|sourceUrl|path|file|providerUrl)$/i.test(childKey)) continue;
    if (childKey === "hostMedia" && isRecord2(child)) {
      if (child.provenance === "workbench-media-capability" && child.assetId === trustedAssetId && typeof trustedLocator === "string") {
        out.hostMedia = {
          provenance: child.provenance,
          assetId: trustedAssetId,
          locator: trustedLocator
        };
      }
      continue;
    }
    if (typeof child === "string") {
      if (containsSensitivePublicText(child) || /(?:path|url)$/i.test(childKey)) continue;
      out[childKey] = child;
    } else if (Array.isArray(child)) {
      const items = [];
      for (const item of child) {
        if (typeof item === "string") {
          if (containsSensitivePublicText(item)) continue;
          items.push(item);
        } else if (Array.isArray(item)) {
          const nested = deepSanitizeMeta(
            { items: item },
            trustedLocator,
            trustedAssetId
          );
          if (nested?.items) items.push(nested.items);
        } else if (isRecord2(item)) {
          const nested = deepSanitizeMeta(
            item,
            trustedLocator,
            trustedAssetId
          );
          if (nested && Object.keys(nested).length) items.push(nested);
        } else {
          items.push(item);
        }
      }
      out[childKey] = items;
    } else if (isRecord2(child)) {
      const nested = deepSanitizeMeta(child, trustedLocator, trustedAssetId);
      if (nested && Object.keys(nested).length) out[childKey] = nested;
    } else {
      out[childKey] = child;
    }
  }
  return Object.keys(out).length ? out : void 0;
}
function safeHostMediaUrl(value) {
  try {
    const url = new URL(value);
    return ["file:", "javascript:", "data:"].includes(url.protocol) ? void 0 : value;
  } catch {
    return void 0;
  }
}
function filterAssets(manifest, trustedMedia, filter) {
  let assets = manifest.assets.map((asset) => publicHostAsset(asset, trustedMedia)).filter((asset) => asset !== null);
  if (filter?.kind) assets = assets.filter((asset) => asset.kind === filter.kind);
  if (filter?.productionType) {
    assets = assets.filter((asset) => asset.productionType === filter.productionType);
  }
  if (filter?.sceneNodeId) {
    assets = assets.filter((asset) => asset.sceneNodeId === filter.sceneNodeId);
  }
  return assets;
}
function mediaFilename(prefix, id, mime) {
  const safeId = id.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";
  const extension = extForContentType(mime);
  return `${prefix}-${safeId}.${extension}`;
}
function mediaIdempotencyKey(operation, parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    const bytes = typeof part === "string" ? Buffer.from(part) : part;
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
  }
  return `wb-game-video:${operation}:${hash.digest("hex")}`;
}
function generatedSourceFingerprint(asset, body) {
  const hash = createHash("sha256");
  for (const part of [
    asset.id,
    asset.type,
    asset.contentType,
    body.contentType,
    body.bytes
  ]) {
    const bytes = typeof part === "string" ? Buffer.from(part) : part;
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}
function extForContentType(contentType) {
  switch (contentType.toLowerCase().split(";", 1)[0]) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "png";
  }
}
function createHostAssetRegistry(context) {
  const withManifestLock = (operation) => context.files.withLocks([HOST_MANIFEST_LOCK], operation);
  const trustedMedia = async () => new Map(
    (await context.media.list(context.gameId)).map((asset) => [asset.id, asset])
  );
  const prepareHostMediaOperation = async (initialManifest, requested) => {
    let manifest = initialManifest;
    const intents = hostMediaIntents(manifest);
    const hostedAssets = await context.media.list(context.gameId);
    const liveAssetIds = new Set(
      manifest.assets.map((asset) => normalizeMediaAsset(asset)).filter((asset) => asset !== null).map((asset) => declaredHostMediaId(asset)).filter((assetId) => assetId !== void 0)
    );
    const remaining = [];
    let recovered;
    let changed = false;
    for (const intent of intents) {
      if (intent.registryId !== requested.registryId) {
        remaining.push(intent);
        continue;
      }
      const candidates = hostedAssets.filter((asset) => matchesHostMediaIntent(intent, asset));
      if (candidates.length > 1) {
        throw new Error(
          `Multiple host media objects match one durable intent: ${intent.registryId}`
        );
      }
      const candidate = candidates[0];
      if (candidate && liveAssetIds.has(candidate.id)) {
        changed = true;
        continue;
      }
      if (sameHostMediaIntent(intent, requested)) {
        remaining.push(intent);
        recovered = candidate;
        continue;
      }
      if (candidate) {
        await context.media.delete(context.gameId, candidate.id);
      }
      changed = true;
    }
    if (changed) {
      manifest = withHostMediaIntents(manifest, remaining);
      await writeHostManifest(context.files, manifest);
    }
    if (!remaining.some((intent) => sameHostMediaIntent(intent, requested))) {
      manifest = withHostMediaIntents(manifest, [...remaining, requested]);
      await writeHostManifest(context.files, manifest);
    }
    return { manifest, ...recovered ? { hosted: recovered } : {} };
  };
  const completeHostMediaOperation = (manifest, intent, hosted) => {
    if (!matchesHostMediaIntent(intent, hosted)) {
      throw new Error("Host media result does not match its durable operation intent");
    }
    const intents = hostMediaIntents(manifest);
    if (!intents.some((entry) => sameHostMediaIntent(entry, intent))) {
      throw new Error("Host media operation intent disappeared before commit");
    }
    return withHostMediaIntents(
      manifest,
      intents.filter((entry) => !sameHostMediaIntent(entry, intent))
    );
  };
  const drainHostMediaReclaims = async (initialManifest, registryId, knownGeneratedSources = /* @__PURE__ */ new Map()) => {
    let manifest = initialManifest;
    for (const reclaim of hostMediaReclaims(manifest)) {
      if (registryId !== void 0 && reclaim.registryId !== registryId) continue;
      const liveAssetIds = new Set(
        manifest.assets.map((asset) => normalizeMediaAsset(asset)).filter((asset) => asset !== null).map((asset) => declaredHostMediaId(asset)).filter((assetId) => assetId !== void 0)
      );
      const candidates = (await context.media.list(context.gameId)).filter((asset) => asset.id === reclaim.assetId);
      if (reclaim.source === "wb-game-video-model-output") {
        if (candidates.length > 1) {
          throw new Error(
            `Ambiguous generated source media identity: ${reclaim.assetId}`
          );
        }
        const known = knownGeneratedSources.get(reclaim.assetId);
        const candidate2 = candidates[0] ?? known?.asset;
        const body = candidates[0] ? await context.media.read(context.gameId, reclaim.assetId) : known?.body;
        if (candidate2) {
          if (liveAssetIds.has(reclaim.assetId)) {
            throw new Error(
              `Refusing to reclaim current host media reference: ${reclaim.assetId}`
            );
          }
          if (!body || generatedSourceFingerprint(candidate2, body) !== reclaim.fingerprint) {
            throw new Error(
              `Refusing to reclaim mismatched generated source provenance: ${reclaim.assetId}`
            );
          }
          await context.media.delete(context.gameId, reclaim.assetId);
        }
        manifest = withHostMediaReclaims(
          manifest,
          hostMediaReclaims(manifest).filter((entry) => entry.assetId !== reclaim.assetId)
        );
        await writeHostManifest(context.files, manifest);
        continue;
      }
      if (candidates.length > 1) {
        throw new Error(
          `Multiple host media objects match one reclaim: ${reclaim.assetId}`
        );
      }
      const candidate = candidates[0];
      const observed = reclaimForHostMedia(reclaim.registryId, candidate);
      if (candidate && (!observed || !sameHostMediaReclaim(reclaim, observed))) {
        throw new Error(
          `Refusing to reclaim host media with mismatched provenance: ${reclaim.assetId}`
        );
      }
      if (candidate && observed && liveAssetIds.has(reclaim.assetId)) {
        throw new Error(
          `Refusing to reclaim current host media reference: ${reclaim.assetId}`
        );
      }
      if (candidate && observed) {
        await context.media.delete(context.gameId, reclaim.assetId);
      }
      manifest = withHostMediaReclaims(
        manifest,
        hostMediaReclaims(manifest).filter((entry) => entry.assetId !== reclaim.assetId)
      );
      await writeHostManifest(context.files, manifest);
    }
    return manifest;
  };
  const persistHostAsset = async (manifest, index, current, next, knownGeneratedSources = /* @__PURE__ */ new Map()) => {
    const hostedAssets = await trustedMedia();
    const previousHostId = current ? trustedHostMediaId(current, hostedAssets) : void 0;
    const nextHostId = trustedHostMediaId(next, hostedAssets);
    if (index >= 0) manifest.assets[index] = next;
    else manifest.assets.push(next);
    let persistedManifest = manifest;
    if (previousHostId && nextHostId && previousHostId !== nextHostId) {
      const reclaim = reclaimForHostMedia(
        next.id,
        hostedAssets.get(previousHostId)
      );
      if (reclaim) {
        persistedManifest = enqueueHostMediaReclaim(
          persistedManifest,
          reclaim
        );
      }
    }
    await writeHostManifest(context.files, persistedManifest);
    await drainHostMediaReclaims(
      persistedManifest,
      next.id,
      knownGeneratedSources
    );
    return publicHostAsset(next, await trustedMedia());
  };
  const upsertInManifest = async (manifest, asset, knownGeneratedSources) => {
    const index = manifest.assets.findIndex((entry) => isRecord2(entry) && entry.id === asset.id);
    const now = Date.now();
    const next = {
      ...asset,
      createdAt: asset.createdAt || now,
      updatedAt: now
    };
    if (index >= 0) {
      const currentRecord = manifest.assets[index];
      if (!isMediaAsset(currentRecord) || isProviderBacked(currentRecord) && currentRecord.sourceModule !== next.sourceModule) {
        throw new Error(`Asset id is owned by another asset domain: ${asset.id}`);
      }
      return persistHostAsset(
        manifest,
        index,
        normalizeMediaAsset(currentRecord),
        next,
        knownGeneratedSources
      );
    }
    return persistHostAsset(
      manifest,
      index,
      null,
      next,
      knownGeneratedSources
    );
  };
  const upsert = async (asset) => withManifestLock(async () => {
    const manifest = await drainHostMediaReclaims(
      await readHostManifest(context.files),
      asset.id
    );
    return upsertInManifest(manifest, asset);
  });
  const getRaw = async (id) => {
    const manifest = await readHostManifest(context.files);
    return normalizeMediaAsset(
      manifest.assets.find((entry) => isRecord2(entry) && entry.id === id)
    );
  };
  const get = async (id) => publicHostAsset(await getRaw(id), await trustedMedia());
  const updateInManifest = async (manifest, id, patch, knownGeneratedSources) => {
    const index = manifest.assets.findIndex((entry) => isRecord2(entry) && entry.id === id);
    if (index < 0) return null;
    const current = normalizeMediaAsset(manifest.assets[index]);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      id,
      createdAt: current.createdAt,
      updatedAt: Date.now()
    };
    if (isProviderBacked(manifest.assets[index]) && current.sourceModule !== next.sourceModule) {
      throw new Error(`Asset id is owned by another asset domain: ${id}`);
    }
    return persistHostAsset(
      manifest,
      index,
      current,
      next,
      knownGeneratedSources
    );
  };
  const update = async (id, patch) => withManifestLock(async () => {
    const manifest = await drainHostMediaReclaims(
      await readHostManifest(context.files),
      id
    );
    return updateInManifest(manifest, id, patch);
  });
  return {
    async list(filter) {
      return filterAssets(
        await readHostManifest(context.files),
        await trustedMedia(),
        filter
      );
    },
    get,
    upsert,
    update,
    async readMedia(id) {
      const asset = await getRaw(id);
      if (!asset) return null;
      if (asset.provider?.ref) {
        const trustedId = trustedHostMediaId(asset, await trustedMedia());
        return trustedId ? context.media.read(context.gameId, trustedId) : null;
      }
      if (!asset.file) return null;
      const relativePath = assertBoundedRelativePath(`assets/${asset.file}`);
      const bytes = await context.files.read(relativePath);
      return bytes ? { contentType: asset.mime ?? "application/octet-stream", bytes } : null;
    },
    async getStyleAxes() {
      return (await readHostManifest(context.files)).styleAxes;
    },
    async setStyleAxes(axes2) {
      return withManifestLock(async () => {
        const manifest = await readHostManifest(context.files);
        const styleAxes = { ...manifest.styleAxes ?? {}, ...axes2 };
        await writeHostManifest(context.files, { ...manifest, styleAxes });
        return styleAxes;
      });
    },
    async importGameFile(input) {
      const relativePath = assertBoundedRelativePath(input.relativePath);
      const bytes = await context.files.read(relativePath);
      if (!bytes) throw new Error(`Reference media was not found: ${relativePath}`);
      const operationId = mediaIdempotencyKey("asset-import", [
        input.registryId,
        relativePath,
        input.contentType,
        bytes
      ]);
      const intent = {
        registryId: input.registryId,
        source: "wb-game-video-reference",
        operationId
      };
      return withManifestLock(async () => {
        const manifest = await drainHostMediaReclaims(
          await readHostManifest(context.files),
          input.registryId
        );
        const prepared = await prepareHostMediaOperation(
          manifest,
          intent
        );
        const hosted = prepared.hosted ?? await context.media.put(context.gameId, {
          filename: input.filename,
          contentType: input.contentType,
          bytes,
          idempotencyKey: operationId,
          metadata: {
            source: intent.source,
            registryId: intent.registryId,
            operationId: intent.operationId
          }
        });
        return upsertInManifest(
          completeHostMediaOperation(prepared.manifest, intent, hosted),
          {
            id: input.registryId,
            kind: "image",
            productionType: input.productionType,
            status: "ready",
            label: input.label,
            sourceModule: input.sourceModule,
            mime: hosted.contentType,
            bytes: hosted.sizeBytes ?? bytes.byteLength,
            url: safeHostMediaUrl(hosted.url),
            provider: { kind: "local", ref: hosted.id },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            meta: {
              ...input.meta ?? {},
              hostMedia: {
                provenance: "workbench-media-capability",
                assetId: hosted.id,
                locator: safeHostMediaUrl(hosted.url)
              }
            }
          }
        );
      });
    },
    async mediaReference(id) {
      const asset = await getRaw(id);
      if (!asset) throw new Error(`\u53C2\u8003\u56FE\u4E0D\u5B58\u5728\uFF1A${id}`);
      if (asset.provider?.ref) {
        const hosted2 = (await context.media.list(context.gameId)).find((candidate) => candidate.id === asset.provider.ref);
        if (!hosted2) {
          throw new Error(`\u53C2\u8003\u56FE ${id} \u7684\u5BBF\u4E3B\u5A92\u4F53\u5F15\u7528\u4E0D\u5B58\u5728`);
        }
        return { assetId: hosted2.id };
      }
      if (!asset.file) throw new Error(`\u53C2\u8003\u56FE ${id} \u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u5BBF\u4E3B\u5A92\u4F53`);
      const relativePath = assertBoundedRelativePath(`assets/${asset.file}`);
      const bytes = await context.files.read(relativePath);
      if (!bytes) throw new Error(`\u53C2\u8003\u56FE ${id} \u5185\u5BB9\u4E0D\u5B58\u5728`);
      const hosted = await context.media.put(context.gameId, {
        filename: mediaFilename("reference", id, asset.mime ?? "image/png"),
        contentType: asset.mime ?? "image/png",
        bytes,
        idempotencyKey: mediaIdempotencyKey("asset-reference", [
          id,
          asset.mime ?? "image/png",
          bytes
        ]),
        metadata: { source: "wb-game-video-registry", registryId: id }
      });
      return { assetId: hosted.id };
    },
    async persistGenerated(generated2, input) {
      return withManifestLock(async () => {
        const manifest = await drainHostMediaReclaims(
          await readHostManifest(context.files),
          input.registryId
        );
        const current = normalizeMediaAsset(
          manifest.assets.find((entry) => isRecord2(entry) && entry.id === input.registryId)
        );
        const currentHostId = current ? trustedHostMediaId(current, await trustedMedia()) : void 0;
        const body = await context.media.read(context.gameId, generated2.id);
        if (!body || body.bytes.byteLength === 0) {
          const hostedAssets = await trustedMedia();
          const hostId = current ? trustedHostMediaId(current, hostedAssets) : void 0;
          const hosted2 = hostId ? hostedAssets.get(hostId) : void 0;
          if (current?.status === "ready" && current.productionType === input.productionType && current.sceneNodeId === input.sceneNodeId && current.label === input.label && current.prompt === input.prompt && current.durationMs === input.durationMs && hosted2 && isRecord2(hosted2.metadata) && hosted2.metadata.source === "wb-game-video-generation" && hosted2.metadata.registryId === input.registryId && hosted2.metadata.generatedAssetId === generated2.id) {
            return publicHostAsset(current, hostedAssets);
          }
          throw new Error("Generated media is not readable through the host media capability");
        }
        const operationId = mediaIdempotencyKey("asset-generation", [
          generated2.id,
          input.registryId,
          body.contentType,
          body.bytes
        ]);
        const intent = {
          registryId: input.registryId,
          source: "wb-game-video-generation",
          operationId
        };
        const prepared = await prepareHostMediaOperation(
          manifest,
          intent
        );
        const hosted = prepared.hosted ?? await context.media.put(context.gameId, {
          filename: mediaFilename(input.filenamePrefix, input.registryId, body.contentType),
          contentType: body.contentType,
          bytes: body.bytes,
          idempotencyKey: operationId,
          metadata: {
            source: intent.source,
            generatedAssetId: generated2.id,
            registryId: intent.registryId,
            operationId: intent.operationId
          }
        });
        let committedManifest = completeHostMediaOperation(
          prepared.manifest,
          intent,
          hosted
        );
        const knownGeneratedSources = /* @__PURE__ */ new Map();
        if (hosted.id !== generated2.id && currentHostId !== generated2.id) {
          committedManifest = enqueueHostMediaReclaim(
            committedManifest,
            {
              registryId: input.registryId,
              assetId: generated2.id,
              source: "wb-game-video-model-output",
              operationId,
              fingerprint: generatedSourceFingerprint(generated2, body)
            }
          );
          knownGeneratedSources.set(generated2.id, { asset: generated2, body });
        }
        const persisted = await updateInManifest(
          committedManifest,
          input.registryId,
          {
            kind: input.productionType === "video_clip" ? "video" : "image",
            productionType: input.productionType,
            status: "ready",
            label: input.label,
            prompt: input.prompt,
            sceneNodeId: input.sceneNodeId,
            sourceModule: "wb-game-video",
            mime: hosted.contentType,
            bytes: hosted.sizeBytes ?? body.bytes.byteLength,
            url: safeHostMediaUrl(hosted.url),
            provider: { kind: "local", ref: hosted.id },
            durationMs: input.durationMs,
            updatedAt: Date.now(),
            meta: {
              ...input.meta ?? {},
              hostMedia: {
                provenance: "workbench-media-capability",
                assetId: hosted.id,
                locator: safeHostMediaUrl(hosted.url)
              }
            }
          },
          knownGeneratedSources
        );
        if (!persisted) {
          throw new Error(`Generating asset disappeared: ${input.registryId}`);
        }
        return persisted;
      });
    }
  };
}
async function getHostStyleAxes(context) {
  return createHostAssetRegistry(context).getStyleAxes();
}

// server/host/browser-media.ts
import { createHash as createHash2, randomUUID } from "crypto";

// src/runtime/schema/node-config-schema.ts
var OVERLAY_DEMO = {
  version: "wb-game-video.overlay.v1",
  variables: {
    lastHit: { id: "lastHit", initial: 0 }
  },
  entities: {
    "ent-player": {
      id: "ent-player",
      name: "\u5C11\u4E3B",
      attrs: { hp: 100, attack: 20, defense: 8 },
      attrMeta: { hp: { max: 100, initial: 100, label: "\u6C14\u8840" } }
    },
    "ent-boss": {
      id: "ent-boss",
      name: "\u5200\u72C2",
      attrs: { hp: 120, attack: 24, defense: 10 },
      attrMeta: { hp: { max: 120, initial: 120, label: "\u6C14\u8840" } }
    }
  },
  ui: {
    overlays: {
      battleHud: {
        id: "battleHud",
        title: "\u6218\u6597\u8986\u76D6\u7269\uFF08\u53CC\u8840\u6761 + \u9632\u53CD + \u98D8\u5B57\uFF09",
        children: [
          {
            id: "playerHp",
            component: "battleHpBar",
            layout: { left: 0, top: 0, width: 1, height: 1 },
            trigger: { when: "enter" },
            inputs: { bind: "ent-player", label: "\u5C11\u4E3B" }
          },
          {
            id: "bossHp",
            component: "battleHpBar",
            layout: { left: 0, top: 0, width: 1, height: 1 },
            trigger: { when: "enter" },
            inputs: { bind: "ent-boss", label: "\u5200\u72C2" }
          },
          {
            id: "parry",
            component: "battleParry",
            layout: { left: 0.5, top: 0.5, translateX: -0.5, translateY: -0.5 },
            trigger: { when: "at", ms: 1200 },
            inputs: {
              events: [
                { id: "A", label: "\u9632\u53CD" },
                { id: "B", label: "\u95EA\u907F" },
                { id: "miss", label: "\u5931\u624B" }
              ],
              defaultEvent: "miss",
              timeoutMs: 900
            }
          }
        ]
      }
    }
  },
  graph: {
    nodes: [
      {
        id: "n-boss-slash",
        type: "perf",
        position: { x: 0, y: 0 },
        data: {
          name: "Boss \u6A2A\u65A9",
          media: { kind: "VIDEO", ref: "difanggongjiqianyao" },
          durationMs: 3200,
          overlayNodes: [{
            overlay: "battleHud",
            layout: { left: 0, top: 0, width: 1, height: 1 },
            reactions: [
              {
                when: { type: "event", id: "A" },
                do: [{
                  kind: "effect",
                  effects: [
                    { kind: "attr", entityId: "ent-boss", attr: "hp", op: "add", value: { expr: "-(entity.ent-player.attr.attack)" } },
                    { kind: "var", varId: "lastHit", op: "set", value: { expr: "entity.ent-player.attr.attack" } }
                  ]
                }]
              },
              {
                when: { type: "event", id: "miss" },
                do: [{
                  kind: "effect",
                  effects: [
                    { kind: "attr", entityId: "ent-player", attr: "hp", op: "add", value: { expr: "-(entity.ent-boss.attr.attack)" } }
                  ]
                }]
              }
            ]
          }]
        }
      },
      {
        id: "n-counter",
        type: "perf",
        position: { x: 280, y: -80 },
        data: {
          name: "\u9632\u53CD\u8FFD\u51FB",
          media: { kind: "VIDEO", ref: "fangfan" },
          overlayNodes: [{ overlay: "battleHud" }]
        }
      },
      {
        id: "n-dodge",
        type: "perf",
        position: { x: 280, y: 40 },
        data: {
          name: "\u95EA\u907F\u540E\u6447",
          media: { kind: "VIDEO", ref: "shanbi" },
          overlayNodes: [{ overlay: "battleHud" }]
        }
      },
      {
        id: "n-hurt",
        type: "perf",
        position: { x: 280, y: 160 },
        data: {
          name: "\u53D7\u51FB",
          media: { kind: "VIDEO", ref: "shouji" },
          overlayNodes: [{ overlay: "battleHud" }]
        }
      }
    ],
    edges: [
      {
        id: "e-A",
        source: "n-boss-slash",
        target: "n-counter",
        sourceHandle: "A",
        targetHandle: "in",
        data: {}
      },
      {
        id: "e-B",
        source: "n-boss-slash",
        target: "n-dodge",
        sourceHandle: "B",
        targetHandle: "in",
        data: {}
      },
      {
        id: "e-miss",
        source: "n-boss-slash",
        target: "n-hurt",
        sourceHandle: "miss",
        targetHandle: "in",
        data: {}
      }
    ]
  }
};
var OVERLAY_DEMO_INSTANCE = {
  mountId: "battleHud",
  overlayId: "battleHud",
  nodeId: "n-boss-slash",
  layout: { left: 0, top: 0, width: 1, height: 1 },
  reactions: OVERLAY_DEMO.graph.nodes[0].data.overlayNodes[0].reactions,
  children: [
    {
      id: "battleHud/playerHp",
      component: "battleHpBar",
      layout: { left: 0, top: 0, width: 1, height: 1 },
      trigger: { when: "enter" },
      inputs: { bind: "ent-player", label: "\u5C11\u4E3B" },
      source: { mountId: "battleHud", overlayId: "battleHud", childId: "playerHp", nodeId: "n-boss-slash" }
    },
    {
      id: "battleHud/bossHp",
      component: "battleHpBar",
      layout: { left: 0, top: 0, width: 1, height: 1 },
      trigger: { when: "enter" },
      inputs: { bind: "ent-boss", label: "\u5200\u72C2" },
      source: { mountId: "battleHud", overlayId: "battleHud", childId: "bossHp", nodeId: "n-boss-slash" }
    },
    {
      id: "battleHud/parry",
      component: "battleParry",
      trigger: { when: "at", ms: 1200 },
      layout: { left: 0.5, top: 0.5, translateX: -0.5, translateY: -0.5 },
      inputs: {
        events: [
          { id: "A", label: "\u9632\u53CD" },
          { id: "B", label: "\u95EA\u907F" },
          { id: "miss", label: "\u5931\u624B" }
        ],
        defaultEvent: "miss",
        timeoutMs: 900
      },
      source: { mountId: "battleHud", overlayId: "battleHud", childId: "parry", nodeId: "n-boss-slash" }
    }
  ]
};

// src/runtime/schema/graph-schema.ts
function getSubFlowPack(d) {
  const p = d.subFlowPack;
  return p && typeof p === "object" && typeof p.id === "string" ? p : void 0;
}
function resolveGraphEntry(graph, preferred) {
  const nodes = graph.nodes;
  if (nodes.length === 0) return void 0;
  if (preferred && nodes.some((n) => n.id === preferred)) return preferred;
  const targets = new Set(graph.edges.map((e) => e.target));
  const roots = nodes.filter((n) => !targets.has(n.id));
  const pool = roots.length > 0 ? roots : nodes;
  return [...pool].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y || a.id.localeCompare(b.id)
  )[0].id;
}

// src/graph/edit/blueprint-refs.ts
function collectPackRefs(graph) {
  const out = /* @__PURE__ */ new Set();
  for (const n of graph.nodes) {
    const p = getSubFlowPack(n.data);
    if (p) out.add(p.id);
  }
  return out;
}
function asMap(src) {
  const doc = src;
  if (doc.manifest?.packs && typeof doc.graph === "object") return doc.manifest.packs;
  return src;
}
function findReferenceCycle(src) {
  const blueprints = asMap(src);
  const path = [];
  const onPath = /* @__PURE__ */ new Set();
  const done = /* @__PURE__ */ new Set();
  function visit(id) {
    if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (done.has(id)) return null;
    const doc = blueprints[id];
    if (!doc) return null;
    path.push(id);
    onPath.add(id);
    for (const ref of collectPackRefs(doc.graph)) {
      const cyc = visit(ref);
      if (cyc) return cyc;
    }
    path.pop();
    onPath.delete(id);
    done.add(id);
    return null;
  }
  for (const id of Object.keys(blueprints)) {
    const cyc = visit(id);
    if (cyc) return cyc;
  }
  return null;
}

// src/editor/persist/blueprint-project.ts
var MAIN_ID = "bp-main";
function metaFromDocument(scn) {
  const m = {};
  if (scn.variables !== void 0) m.variables = scn.variables;
  if (scn.entities !== void 0) m.entities = scn.entities;
  if (scn.ui !== void 0) m.ui = scn.ui;
  if (scn.textStylePresets !== void 0) m.textStylePresets = scn.textStylePresets;
  if (scn.bgm !== void 0) m.bgm = scn.bgm;
  const formulas = scn.formulas;
  if (formulas !== void 0) m.formulas = formulas;
  return m;
}
function buildManifest(blueprints, mainId) {
  const next = {};
  for (const [id, d] of Object.entries(blueprints)) {
    const entry = resolveGraphEntry(d.graph, d.entry) ?? d.entry;
    next[id] = entry === d.entry ? d : { ...d, entry };
  }
  return {
    version: "wb-game-video.blueprint-manifest.v1",
    mainPackId: mainId,
    packs: next
  };
}
function documentFromBlueprints(blueprints, mainId, meta) {
  const manifest = buildManifest(blueprints, mainId);
  const main = manifest.packs[mainId];
  return {
    version: "wb-game-video.graph.v1",
    ...meta,
    graph: main?.graph ?? { nodes: [], edges: [] },
    manifest
  };
}
function documentFromScenario(scn, opts = {}) {
  const mainId = opts.mainId ?? MAIN_ID;
  const main = {
    id: mainId,
    title: "\u4E3B\u84DD\u56FE",
    entry: resolveGraphEntry(scn.graph, scn.graph.nodes[0]?.id) ?? scn.graph.nodes[0]?.id ?? "entry",
    graph: scn.graph
  };
  return documentFromBlueprints({ [mainId]: main }, mainId, metaFromDocument(scn));
}
function normalizeDocument(doc) {
  const any = doc;
  if (any.manifest?.packs && any.manifest.mainPackId) {
    const mainId = any.manifest.mainPackId;
    const bps = { ...any.manifest.packs };
    const main = bps[mainId];
    if (main) bps[mainId] = { ...main, graph: main.graph, entry: resolveGraphEntry(main.graph, main.entry) ?? main.entry };
    return documentFromBlueprints(bps, mainId, metaFromDocument(any));
  }
  return documentFromScenario(doc);
}
function validateDocument(doc) {
  const normalized = normalizeDocument(doc);
  const errors = [];
  const blueprints = normalized.manifest.packs;
  const mainId = normalized.manifest.mainPackId;
  for (const [bpId, bp] of Object.entries(blueprints)) {
    const seen = /* @__PURE__ */ new Set();
    for (const n of bp.graph.nodes) {
      if (seen.has(n.id)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u5185\u8282\u70B9 id \u91CD\u590D\uFF1A'${n.id}'`);
      seen.add(n.id);
    }
    for (const e of bp.graph.edges) {
      if (!seen.has(e.source)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8FB9 '${e.id}' source \u6307\u5411\u4E0D\u5B58\u5728\u7684\u8282\u70B9 '${e.source}'`);
      if (!seen.has(e.target)) errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) \u8FB9 '${e.id}' target \u6307\u5411\u4E0D\u5B58\u5728\u7684\u8282\u70B9 '${e.target}'`);
    }
    if (bp.graph.nodes.length > 0 && !bp.graph.nodes.some((n) => n.id === bp.entry)) {
      const fallback = resolveGraphEntry(bp.graph) ?? "\u2205";
      errors.push(`\u84DD\u56FE\u300C${bp.title}\u300D(${bpId}) entry '${bp.entry}' \u4E0D\u5728\u56FE\u4E2D\uFF08\u5C06\u56DE\u9000\u5230 ${fallback}\uFF09`);
    }
  }
  if (!blueprints[mainId]) {
    errors.push(`manifest.mainPackId '${mainId}' \u4E0D\u5728 manifest.packs \u4E2D`);
  }
  const cycle = findReferenceCycle(blueprints);
  if (cycle) errors.push(`\u84DD\u56FE\u5F15\u7528\u6210\u73AF\uFF1A${cycle.join(" \u2192 ")}`);
  return errors;
}

// src/editor/assets/registry-types.ts
function makeAssetId(productionType) {
  const tag = productionType === "video_clip" ? "vid" : productionType === "shot_image" ? "img" : productionType === "grid_storyboard" ? "grid" : productionType === "character_ref" ? "char" : "scene";
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `a-${tag}-${t}-${r}`;
}

// server/engine/llm/config/styleSkillLoader.ts
function parseFrontmatter(raw) {
  const s = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  if (!m) return { meta: {}, body: s };
  const meta = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    const key = kv?.[1];
    if (!kv || !key) continue;
    let v = (kv[2] ?? "").trim();
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1);
    }
    meta[key] = v;
  }
  return { meta, body: s.slice(m[0].length) };
}
function parseSections(body) {
  const heads = [];
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  let m;
  while (m = re.exec(body)) {
    heads.push({ title: (m[1] ?? "").trim(), contentStart: re.lastIndex, headStart: m.index });
  }
  const out = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    if (!h) continue;
    const next = heads[i + 1];
    const end = next ? next.headStart : body.length;
    out[h.title] = body.slice(h.contentStart, end).trim();
  }
  return out;
}
function parseStyleSkill(raw) {
  const { meta, body } = parseFrontmatter(raw);
  return { meta, sections: parseSections(body) };
}
function needMeta(p, key, where) {
  const v = (p.meta[key] ?? "").trim();
  if (!v) throw new Error(`[styleSkillLoader] ${where} \u7F3A frontmatter:${key}`);
  return v;
}
function needSection(p, key, where) {
  const v = (p.sections[key] ?? "").trim();
  if (!v) throw new Error(`[styleSkillLoader] ${where} \u7F3A section:${key}`);
  return v;
}
function assertId(p, expectedId) {
  const id = (p.meta.name ?? "").trim();
  if (id !== expectedId) {
    throw new Error(
      `[styleSkillLoader] id \u4E0D\u5339\u914D: \u76EE\u5F55=${expectedId} frontmatter.name=${id}`
    );
  }
}
function parseSwatch(raw, where) {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const a = parts[0];
  const b = parts[1];
  if (!a || !b) {
    throw new Error(`[styleSkillLoader] ${where} swatch \u9700\u8981\u4E24\u4E2A\u989C\u8272: "${raw}"`);
  }
  return [a, b];
}

// server/engine/llm/_raw.ts
import { readFileSync as readFileSync2 } from "fs";
import { fileURLToPath } from "url";
function readRaw(metaUrl, relPath) {
  return readFileSync2(fileURLToPath(new URL(relPath, metaUrl)), "utf8");
}

// server/engine/llm/config/filmLookPresets.ts
var retroFutureRaw = readRaw(import.meta.url, "../skills/film-looks/retro-future/SKILL.md");
var baroqueRaw = readRaw(import.meta.url, "../skills/film-looks/baroque-chiaroscuro/SKILL.md");
var tealOrangeRaw = readRaw(import.meta.url, "../skills/film-looks/teal-orange/SKILL.md");
var bleachBypassRaw = readRaw(import.meta.url, "../skills/film-looks/bleach-bypass/SKILL.md");
var pastelRaw = readRaw(import.meta.url, "../skills/film-looks/pastel-symmetry/SKILL.md");
var noirRaw = readRaw(import.meta.url, "../skills/film-looks/noir-lowkey/SKILL.md");
var warmNostalgiaRaw = readRaw(import.meta.url, "../skills/film-looks/warm-nostalgia/SKILL.md");
var clinicalRaw = readRaw(import.meta.url, "../skills/film-looks/clinical-scifi/SKILL.md");
var morandiRaw = readRaw(import.meta.url, "../skills/film-looks/morandi-muted/SKILL.md");
var bronzeRaw = readRaw(import.meta.url, "../skills/film-looks/bronze-epic/SKILL.md");
var REGISTRY = [
  ["retro-future", retroFutureRaw],
  ["baroque-chiaroscuro", baroqueRaw],
  ["teal-orange", tealOrangeRaw],
  ["bleach-bypass", bleachBypassRaw],
  ["pastel-symmetry", pastelRaw],
  ["noir-lowkey", noirRaw],
  ["warm-nostalgia", warmNostalgiaRaw],
  ["clinical-scifi", clinicalRaw],
  ["morandi-muted", morandiRaw],
  ["bronze-epic", bronzeRaw]
];
function toPreset(id, raw) {
  const p = parseStyleSkill(raw);
  assertId(p, id);
  return {
    id,
    label: needMeta(p, "label", id),
    hint: needMeta(p, "hint", id),
    swatch: parseSwatch(needMeta(p, "swatch", id), id),
    tagline: needMeta(p, "tagline", id),
    colorPrefix: needSection(p, "\u8C03\u8272\u951A\u70B9", id),
    sceneAdapt: needSection(p, "\u573A\u666F\u81EA\u9002\u5E94", id),
    authoringHint: needSection(p, "\u4F5C\u8005\u6587\u98CE", id),
    posterPrompt: needSection(p, "\u6D77\u62A5\u6837\u5F20", id)
  };
}
var FILM_LOOK_PRESETS = Object.fromEntries(
  REGISTRY.map(([id, raw]) => [id, toPreset(id, raw)])
);
var FILM_LOOK_LIST = REGISTRY.map(
  ([id]) => FILM_LOOK_PRESETS[id]
);
function filmLookColorPrefix(look) {
  if (!look) return "";
  return FILM_LOOK_PRESETS[look]?.colorPrefix ?? "";
}
function coerceFilmLookId(v) {
  if (typeof v !== "string") return void 0;
  const id = v.trim();
  return id in FILM_LOOK_PRESETS ? id : void 0;
}
function filmLookAuthoringHint(look) {
  if (!look) return "";
  const p = FILM_LOOK_PRESETS[look];
  if (!p) return "";
  return `${p.authoringHint}
\u573A\u666F\u81EA\u9002\u5E94\uFF1A${p.sceneAdapt}`;
}

// server/engine/llm/config/visualStylePresets.ts
var photorealRaw = readRaw(import.meta.url, "../skills/art-media/photoreal/SKILL.md");
var animeRaw = readRaw(import.meta.url, "../skills/art-media/anime/SKILL.md");
var cartoonRaw = readRaw(import.meta.url, "../skills/art-media/cartoon/SKILL.md");
var pixelartRaw = readRaw(import.meta.url, "../skills/art-media/pixelart/SKILL.md");
var watercolorRaw = readRaw(import.meta.url, "../skills/art-media/watercolor/SKILL.md");
var inkRaw = readRaw(import.meta.url, "../skills/art-media/ink/SKILL.md");
var render3d2dRaw = readRaw(import.meta.url, "../skills/art-media/render3d2d/SKILL.md");
var REGISTRY2 = [
  ["photoreal", photorealRaw],
  ["anime", animeRaw],
  ["cartoon", cartoonRaw],
  ["pixelart", pixelartRaw],
  ["watercolor", watercolorRaw],
  ["ink", inkRaw],
  ["render3d2d", render3d2dRaw]
];
function toPreset2(id, raw) {
  const p = parseStyleSkill(raw);
  assertId(p, id);
  return {
    id,
    label: needMeta(p, "label", id),
    hint: needMeta(p, "hint", id),
    swatch: parseSwatch(needMeta(p, "swatch", id), id),
    tagline: needMeta(p, "tagline", id),
    promptPrefix: needSection(p, "\u51FA\u56FE\u524D\u7F00", id),
    authoringHint: needSection(p, "\u4F5C\u8005\u6587\u98CE", id),
    posterPrompt: needSection(p, "\u6D77\u62A5\u6837\u5F20", id)
  };
}
var VISUAL_STYLE_PRESETS = Object.fromEntries(
  REGISTRY2.map(([id, raw]) => [id, toPreset2(id, raw)])
);
var VISUAL_STYLE_LIST = REGISTRY2.map(
  ([id]) => VISUAL_STYLE_PRESETS[id]
);
function composeVisualPrompt(rawPrompt, style, look) {
  const colorPrefix = filmLookColorPrefix(look);
  const mediumPrefix = style ? VISUAL_STYLE_PRESETS[style]?.promptPrefix ?? "" : "";
  const prefix = [colorPrefix, mediumPrefix].filter(Boolean).join("\n\n");
  if (!prefix) return rawPrompt;
  if (!rawPrompt) return prefix;
  return `${prefix}

${rawPrompt}`;
}
function getAuthoringHint(style, look) {
  const mediumHint = style ? VISUAL_STYLE_PRESETS[style]?.authoringHint ?? "" : "";
  const lookHint = filmLookAuthoringHint(look);
  return [mediumHint, lookHint].filter(Boolean).join("\n");
}

// server/engine/llm/config/directorSkillLoader.ts
var principleRaw = readRaw(import.meta.url, "../skills/directors/_shared/directing-principle.md");
var minimalEpicRaw = readRaw(import.meta.url, "../skills/directors/minimal-epic/SKILL.md");
var precisionNoirRaw = readRaw(import.meta.url, "../skills/directors/precision-noir/SKILL.md");
var foreknowledgeSuspenseRaw = readRaw(import.meta.url, "../skills/directors/foreknowledge-suspense/SKILL.md");
var moodNeonRaw = readRaw(import.meta.url, "../skills/directors/mood-neon/SKILL.md");
var luminousAnimeRaw = readRaw(import.meta.url, "../skills/directors/luminous-anime/SKILL.md");
var kineticClarityRaw = readRaw(import.meta.url, "../skills/directors/kinetic-clarity/SKILL.md");
var cyberpunkRaw = readRaw(import.meta.url, "../skills/directors/cyberpunk-neonoir/SKILL.md");
var unseenHorrorRaw = readRaw(import.meta.url, "../skills/directors/unseen-horror/SKILL.md");
var nonlinearScifiRaw = readRaw(import.meta.url, "../skills/directors/nonlinear-scifi/SKILL.md");
var pulpDialogueRaw = readRaw(import.meta.url, "../skills/directors/pulp-dialogue/SKILL.md");
var DIRECTING_PRINCIPLE = principleRaw.replace(/^\uFEFF/, "").trim();
function parseFrontmatter2(raw) {
  const s = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(s);
  if (!m) return { meta: {}, body: s };
  const meta = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    const key = kv?.[1];
    if (!kv || !key) continue;
    let v = (kv[2] ?? "").trim();
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1);
    }
    meta[key] = v;
  }
  return { meta, body: s.slice(m[0].length) };
}
function parseSections2(body) {
  const heads = [];
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  let m;
  while (m = re.exec(body)) {
    heads.push({ title: (m[1] ?? "").trim(), contentStart: re.lastIndex, headStart: m.index });
  }
  const out = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    if (!h) continue;
    const next = heads[i + 1];
    const end = next ? next.headStart : body.length;
    out[h.title] = body.slice(h.contentStart, end).trim();
  }
  return out;
}
function parse(raw) {
  const { meta, body } = parseFrontmatter2(raw);
  return { meta, sections: parseSections2(body) };
}
function toPersona(expectedId, raw) {
  const { meta, sections } = parse(raw);
  const need = (obj, key, where) => {
    const v = (obj[key] ?? "").trim();
    if (!v) throw new Error(`[directorSkillLoader] ${expectedId} \u7F3A ${where}:${key}`);
    return v;
  };
  const id = need(meta, "name", "frontmatter");
  if (id !== expectedId) {
    throw new Error(`[directorSkillLoader] id \u4E0D\u5339\u914D: \u76EE\u5F55=${expectedId} frontmatter.name=${id}`);
  }
  return {
    id: expectedId,
    displayName: need(meta, "displayName", "frontmatter"),
    tagline: need(meta, "tagline", "frontmatter"),
    identity: need(sections, "\u8EAB\u4EFD", "section"),
    editingGrammar: need(sections, "\u526A\u8F91\u8BED\u6CD5", "section"),
    cameraLanguage: need(sections, "\u955C\u5934\u8BED\u8A00", "section"),
    pacing: need(sections, "\u8282\u594F", "section"),
    downstreamBinding: need(sections, "\u4E0B\u6E38\u7ED1\u5B9A", "section"),
    posterPrompt: need(sections, "\u6D77\u62A5\u6837\u5F20", "section")
  };
}
var REGISTRY3 = [
  ["minimal-epic", minimalEpicRaw],
  ["precision-noir", precisionNoirRaw],
  ["foreknowledge-suspense", foreknowledgeSuspenseRaw],
  ["mood-neon", moodNeonRaw],
  ["luminous-anime", luminousAnimeRaw],
  ["kinetic-clarity", kineticClarityRaw],
  ["cyberpunk-neonoir", cyberpunkRaw],
  ["unseen-horror", unseenHorrorRaw],
  ["nonlinear-scifi", nonlinearScifiRaw],
  ["pulp-dialogue", pulpDialogueRaw]
];
var DIRECTOR_PERSONAS = Object.fromEntries(REGISTRY3.map(([id, raw]) => [id, toPersona(id, raw)]));
var DIRECTOR_ORDER = REGISTRY3.map(
  ([id]) => id
);

// server/engine/llm/config/directorPersonas.ts
var DEFAULT_DIRECTOR_STYLE = "minimal-epic";
var PERSONAS = DIRECTOR_PERSONAS;
function resolveDirectorPersona(id, custom) {
  if (id === "custom" && custom && custom.trim()) {
    return {
      id: "custom",
      displayName: "\u81EA\u5B9A\u4E49",
      tagline: "\u4F5C\u8005\u81EA\u586B persona",
      identity: custom.trim(),
      editingGrammar: "\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u4EE5 identity \u6BB5\u63CF\u8FF0\u4E3A\u51C6\uFF1B\u5982\u672A\u6307\u5B9A\uFF0C\u9ED8\u8BA4\u8282\u62CD\u4E2D\u901F\u3001\u526A\u8F91\u4E0D\u8FC7\u5EA6\u98CE\u683C\u5316\uFF09",
      cameraLanguage: "\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u4EE5 identity \u6BB5\u63CF\u8FF0\u4E3A\u51C6\uFF1B\u5982\u672A\u6307\u5B9A\uFF0C\u9ED8\u8BA4 medium+close \u6DF7\u5408\u3001\u81EA\u7136\u5149\u3001\u4E2D\u6027\u8272\u5F69\uFF09",
      pacing: "\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u4EE5 identity \u6BB5\u63CF\u8FF0\u4E3A\u51C6\uFF1B\u5982\u672A\u6307\u5B9A\uFF0C\u9ED8\u8BA4\u6839\u636E\u573A\u666F\u60C5\u7EEA\u81EA\u8C03\uFF09",
      downstreamBinding: '\uFF08\u4F5C\u8005\u81EA\u5B9A\u4E49\u2014\u2014\u6309 identity \u63CF\u8FF0\u7684\u98CE\u683C\uFF0C\u9075\u5FAA"\u955C\u5934\u8C03\u5EA6\u901A\u5219"\uFF1A\u666F\u522B\u968F\u620F\u8D70\u3001\u7B7E\u540D\u70B9\u775B\u4E0D\u9010\u955C\u5957\u7528\u3001\u7D27\u5F20\u5904\u5FEB\u5207\u3001\u8FDE\u8D2F\u6865\u6BB5\u5C3D\u91CF 15 \u79D2\u5185\u4E00\u955C\u5230\u5E95\u3001\u77ED\u62CD\u7EA6 4 \u79D2\u7559\u88C1\u526A\uFF09',
      posterPrompt: "Cinematic film poster, balanced dramatic composition, natural cinematic lighting, neutral filmic color grade, evocative mood, no text, vertical 2:3"
    };
  }
  const chosen = id && id !== "custom" ? id : DEFAULT_DIRECTOR_STYLE;
  return PERSONAS[chosen] ?? PERSONAS[DEFAULT_DIRECTOR_STYLE];
}
function serializePersonaToPrompt(p) {
  return [
    `# \u5BFC\u6F14\u6D41\u6D3E\uFF1A${p.displayName} \u2014\u2014 ${p.tagline}`,
    "",
    `**\u8EAB\u4EFD**\uFF1A${p.identity}`,
    "",
    `**\u526A\u8F91\u8BED\u6CD5**\uFF1A${p.editingGrammar}`,
    "",
    `**\u955C\u5934\u8BED\u8A00**\uFF1A${p.cameraLanguage}`,
    "",
    `**\u955C\u5934\u8C03\u5EA6\u901A\u5219\uFF08\u51CC\u9A7E\u4E8E\u4E0A\u9762\u7684\u98CE\u683C\u4E4B\u4E0A\uFF0C\u6240\u6709\u5BFC\u6F14\u901A\u7528\uFF09**\uFF1A${DIRECTING_PRINCIPLE}`,
    "",
    `**\u8282\u594F\u504F\u597D**\uFF1A${p.pacing}`,
    "",
    `**\u4E0B\u6E38\u7ED1\u5B9A\uFF08\u843D\u5230\u9010\u955C\u51FA\u7247 / \u526A\u8F91\uFF1B\u60C5\u5883\u5316\u8C03\u5EA6\uFF0C\u975E\u9010\u955C\u5957\u7528\uFF09**\uFF1A
${p.downstreamBinding}`
  ].join("\n");
}
function coerceDirectorStyleId(v) {
  if (typeof v !== "string") return void 0;
  const t = v.trim();
  return DIRECTOR_ORDER.includes(t) ? t : void 0;
}

// server/engine/axes.ts
function coerceVisualStyleId(v) {
  if (typeof v !== "string") return void 0;
  const id = v.trim();
  return id in VISUAL_STYLE_PRESETS ? id : void 0;
}
function composeAxes(axes2, custom) {
  const artMedia = coerceVisualStyleId(axes2?.artMedia);
  const filmLook = coerceFilmLookId(axes2?.filmLook);
  const director = coerceDirectorStyleId(axes2?.director);
  const uiStylePrompt = composeVisualPrompt("", artMedia, filmLook);
  const authoringHint = getAuthoringHint(artMedia, filmLook);
  const persona = resolveDirectorPersona(director, custom);
  const directorSystem = serializePersonaToPrompt(persona);
  const styleKeywords = authoringHint.split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    ...artMedia ? { artMedia } : {},
    ...filmLook ? { filmLook } : {},
    uiStylePrompt,
    authoringHint,
    directorSystem,
    styleKeywords
  };
}

// server/engine/fmv/templates.ts
function buildPerspectiveLockBlock(perspective2, context = "video") {
  if (!perspective2) return "";
  const suffix = context === "phase3" ? " \xB7 \u6240\u6709\u955C\u5934\u5FC5\u987B\u9075\u5FAA" : "";
  const prefix = context === "phase3" ? "seedancePrompt \u4E2D" : "\u753B\u9762\u4E2D";
  switch (perspective2) {
    case "\u7B2C\u4E00\u4EBA\u79F0":
      return [
        `\u3010\u89C6\u89D2\u9501\u5B9A \xB7 \u7B2C\u4E00\u4EBA\u79F0 POV${suffix}\u3011`,
        "\u6444\u5F71\u673A = \u4E3B\u89D2\u773C\u775B\u3002\u786C\u7EA6\u675F\uFF1A",
        `1. ${prefix}\u6C38\u8FDC\u4E0D\u51FA\u73B0\u4E3B\u89D2\u7684\u6B63\u9762\u3001\u4FA7\u9762\u6216\u80CC\u5F71\uFF08\u6444\u5F71\u673A\u5373\u4E3B\u89D2\u89C6\u91CE\uFF09\uFF1B`,
        "2. \u5176\u4ED6\u89D2\u8272\u9762\u671D\u6444\u5F71\u673A\u65B9\u5411\u8BF4\u8BDD/\u4E92\u52A8\uFF08\u5236\u9020\u300C\u5BF9\u7740\u89C2\u4F17\u300D\u7684\u6C89\u6D78\u611F\uFF09\uFF1B",
        "3. \u4E3B\u89D2\u80A2\u4F53\u4EC5\u5141\u8BB8\u51FA\u73B0\uFF1A\u4F38\u51FA\u7684\u624B/\u624B\u81C2\u3001\u4F4E\u5934\u770B\u5230\u7684\u8EAF\u5E72\u5C40\u90E8\u3001\u5F71\u5B50\uFF1B",
        "4. \u955C\u5934\u8F7B\u5FAE\u547C\u5438\u6D6E\u52A8 + \u89C6\u7EBF\u968F\u6CE8\u610F\u529B\u8F6C\u79FB\u81EA\u7136\u6446\u52A8\uFF08\u6A21\u62DF\u771F\u5B9E\u4EBA\u773C\uFF09\uFF1B",
        "5. \u8FD0\u955C\u4E0D\u5F97\u51FA\u73B0\u73AF\u7ED5 / \u7B2C\u4E09\u4EBA\u79F0\u5916\u90E8\u673A\u4F4D / \u4FEF\u77B0\u2014\u2014\u4EFB\u4F55\u66B4\u9732\u4E3B\u89D2\u5168\u8C8C\u7684\u673A\u4F4D\u90FD\u4E0D\u5408\u89C4\u3002"
      ].join("\n");
    default:
      return [
        `\u3010\u89C6\u89D2\u57FA\u7EBF \xB7 \u7B2C\u4E09\u4EBA\u79F0\u7535\u5F71\u955C\u5934${suffix}\u3011`,
        "\u6309\u6B63\u5E38\u7535\u5F71\u955C\u5934\u89C4\u5212\u5904\u7406\uFF0C\u4E0D\u505A\u4EBA\u79F0\u673A\u4F4D\u786C\u9650\u5236\uFF1A",
        `1. ${prefix}\u53EF\u4EE5\u6839\u636E\u53D9\u4E8B\u9700\u8981\u4F7F\u7528\u8FDC\u666F\u3001\u822A\u62CD\u3001\u9E1F\u77B0\u3001\u4FEF\u62CD\u3001\u8FC7\u80A9\u3001\u7279\u5199\u3001\u7A7A\u955C\u6216\u591A\u89D2\u8272\u8C03\u5EA6\uFF1B`,
        "2. \u4E0D\u8981\u6C42\u6444\u5F71\u673A\u7D27\u968F\u4E3B\u89D2\uFF0C\u4E5F\u4E0D\u8981\u6C42\u4E3B\u89D2\u59CB\u7EC8\u5165\u753B\uFF1B",
        "3. \u53EA\u9700\u4FDD\u6301\u573A\u9762\u8C03\u5EA6\u3001\u89D2\u8272\u5173\u7CFB\u548C\u4FE1\u606F\u63ED\u793A\u6E05\u6670\uFF0C\u4E0D\u5F97\u8BEF\u5199\u6210\u7B2C\u4E00\u4EBA\u79F0 POV\u3002"
      ].join("\n");
  }
}
var VIDEO_EXTEND_HEADER_BLOCK = [
  "\u3010\u89C6\u9891\u5EF6\u957F\u4EFB\u52A1 \xB7 V-PROMPT-15\u3011",
  "\u5EF6\u7EED\u4E0A\u4E00\u6BB5\u89C6\u9891\u5185\u5BB9\uFF0C\u4ECE @\u89C6\u98911 \u7684\u5C3E\u5E27\u65E0\u7F1D\u63A5\u7EED\u3002",
  "\u6865\u63A5\u5E27\u7B56\u7565\uFF1A\u5F00\u573A\u77ED\u6682\u4FDD\u6301 @\u89C6\u98911 \u672B\u5E27\u7684\u4EBA\u7269\u59FF\u6001\u3001\u8868\u60C5\u3001\u5149\u5F71\u548C\u955C\u5934\u4F4D\u7F6E\u9AD8\u5EA6\u4E00\u81F4\uFF0C\u4EC5\u5141\u8BB8\u5FAE\u5E45\u81EA\u7136\u8FD0\u52A8\uFF0C\u968F\u540E\u63A8\u8FDB\u65B0\u52A8\u4F5C\u3002",
  "\u8854\u63A5\u7B56\u7565\uFF1A\u4E0A\u4E00\u6BB5\u82E5\u5728\u5207\u955C\u6216\u8F6C\u573A\u540E\u7ED3\u675F\uFF0C\u672C\u6BB5\u5E94\u4ECE\u5207\u955C\u540E\u7684\u65B0\u753B\u9762\u81EA\u7136\u8D77\u59CB\uFF1B\u7981\u6B62\u56DE\u9000\u5230\u4E0A\u4E00\u6BB5\u5DF2\u5B8C\u6210\u52A8\u4F5C\u3002",
  "\u8BED\u4E49\u8FB9\u754C\uFF1A@\u89C6\u98911 \u53EA\u7528\u4E8E\u65F6\u5E8F\u5EF6\u957F\uFF0C\u4E0D\u4F5C\u4E3A\u7279\u6548\u53C2\u8003\u89C6\u9891\uFF1B\u7279\u6548\u8FD0\u52A8\u903B\u8F91\u5FC5\u987B\u4F7F\u7528\u72EC\u7ACB\u7279\u6548\u53C2\u8003\u7D20\u6750\u8BF4\u660E\u3002",
  "\u786C\u7EA6\u675F\uFF087 \u7C7B\u5168\u90E8\u6EE1\u8DB3\u624D\u5408\u89C4\uFF09\uFF1A",
  "1. \u4EBA\u7269\u8EAB\u4EFD\uFF1A\u4E3B\u89D2 / \u914D\u89D2\u7684\u9762\u90E8\u3001\u53D1\u578B\u3001\u670D\u88C5\u3001\u77B3\u8272\u4E25\u683C\u6CBF\u7528 @\u89C6\u98911\uFF0C\u4E0D\u5F97\u66FF\u6362\u6216\u53D8\u5F62\uFF1B",
  "2. \u955C\u5934\u4F4D\u7F6E\uFF1A\u8D77\u59CB\u673A\u4F4D\u3001\u7126\u8DDD\u3001\u89C6\u89D2\u4E0E @\u89C6\u98911 \u672B\u5E27\u4E00\u81F4\u6216\u5408\u7406\u63A8\u8FDB\uFF0C\u7981\u6B62\u8DF3\u5207\u5230\u65E0\u5173\u673A\u4F4D\uFF1B",
  "3. \u5149\u5F71\u8272\u6E29\uFF1A\u4E3B\u5149\u6E90\u65B9\u5411\u3001\u8272\u6E29\u3001\u9634\u5F71\u67D4\u548C\u5EA6\u4E0E @\u89C6\u98911 \u9501\u5B9A\uFF0C\u7981\u6B62\u8DF3\u53D8\uFF1B",
  "4. \u8868\u6F14\u8282\u594F\uFF1A\u89D2\u8272\u59FF\u6001 / \u8868\u60C5 / \u52A8\u4F5C\u5F27\u7EBF\u4ECE @\u89C6\u98911 \u672B\u5E27\u81EA\u7136\u63A8\u8FDB\uFF0C\u7981\u6B62\u300C\u91CD\u65B0\u5F00\u59CB\u300D\u6216\u91CD\u7F6E\uFF1B",
  "5. \u573A\u666F\u7A7A\u95F4\uFF1A\u5730\u7406\u65B9\u4F4D\u3001\u9053\u5177\u4F4D\u7F6E\u3001\u5165\u753B\u65B9\u4F4D\u4E0E @\u89C6\u98911 \u4E00\u81F4\uFF0C\u7981\u6B62\u91CD\u7F6E\u573A\u666F\uFF1B",
  "6. \u5E27\u95F4\u4E00\u81F4\u6027\uFF1A\u76F8\u90BB\u5E27\u4E4B\u95F4\u7269\u4F53\u4F4D\u7F6E\u3001\u989C\u8272\u3001\u5149\u5F71\u53D8\u5316\u81EA\u7136\u8FDE\u7EED\uFF0C\u65E0\u95EA\u70C1\u3001\u65E0\u8DF3\u53D8\u3001\u65E0\u7269\u4F53\u53D8\u5F62\u2014\u2014\u7981\u6B62\u4EFB\u4F55\u5E27\u95F4\u4E0D\u4E00\u81F4\uFF1B",
  "7. \u7981\u6B62\u91CD\u590D\uFF1A\u4E0D\u5F97\u590D\u523B @\u89C6\u98911 \u672B\u5C3E\u5DF2\u5B8C\u6210\u7684\u52A8\u4F5C / \u8868\u60C5 / \u53F0\u8BCD\uFF0C\u76F4\u63A5\u4ECE\u65B0\u52A8\u4F5C\u5F00\u59CB\u3002",
  "**7 \u7C7B\u5168\u8FC7\u624D\u5408\u89C4\uFF0C\u4EFB\u4E00\u7C7B\u8FDD\u53CD\u9700\u91CD\u5199\u3002**"
].join("\n");

// server/engine/fmv/shot-script.ts
var MIN_SHOT_DURATION = 4;
var MAX_SHOT_DURATION = 15;
var OPTIMAL_SHOT_DURATION = 8;
var DURATION_TOLERANCE_SECONDS = 5;
var MIN_PROMPT_LENGTH = 80;
var MAX_PROMPT_LENGTH = 700;
var PHASE3_TASK_HEADLINE = `\u4F60\u662F\u4E13\u4E1A\u7684 Seedance 2 \u5206\u955C\u5BFC\u6F14 AI\u3002\u672C\u6B21\u552F\u4E00\u4EFB\u52A1\uFF1A\u4E3A\u5355\u4E2A\u5267\u60C5\u8282\u70B9\u751F\u6210 Seedance 2 \u53EF\u76F4\u63A5\u6267\u884C\u7684\u7B80\u6D01\u955C\u5934\u5E8F\u5217 Prompt\u3002

\u2705 \u6838\u5FC3\u539F\u5219\uFF1A
- \u50CF\u5199 Seedance \u5DE5\u7A0B\u6307\u4EE4\u4E00\u6837\u5199 Prompt\uFF0C\u4E0D\u662F\u5199\u6587\u5B66\u63CF\u8FF0
- \u4F7F\u7528\u300C\u955C\u59341 / \u955C\u59342 / \u2026\u300D\u8868\u8FBE\u4E8B\u4EF6\u987A\u5E8F\uFF0C\u4E0D\u5199\u7EDD\u5BF9\u79D2\u6570
- \u6240\u6709\u63CF\u8FF0\u5FC5\u987B\u662F\u53EF\u62CD\u6444\u7684\u7269\u7406\u52A8\u4F5C\u548C\u89C6\u89C9\u5143\u7D20
- \u4E0D\u8F93\u51FA JSON \u7ED3\u6784\u5316\u5B57\u6BB5\uFF08\u5982 shotSize / cameraMovement \u7B49\u679A\u4E3E\uFF09\uFF0C\u5168\u90E8\u8F6C\u5316\u4E3A\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0

\u274C \u7EDD\u5BF9\u7981\u6B62\uFF1A
- seedancePrompt \u4E2D\u51FA\u73B0\u4EFB\u4F55\u53F0\u8BCD\u5B57\u9762\uFF08\u65E0\u8BBA\u662F\u5426\u5E26\u5F15\u53F7\uFF09
- \u4F7F\u7528\u300C\u8BF4\uFF1A\u300D\u300C\u95EE\u9053\uFF1A\u300D\u300C\u558A\uFF1A\u300D\u7B49\u8A00\u8BF4\u52A8\u8BCD
- \u51FA\u73B0\u300C\u4E3B\u89D2\u7684\u8868\u60C5\u5F88\u7D27\u5F20\u300D\u8FD9\u7C7B\u62BD\u8C61\u60C5\u7EEA\u63CF\u8FF0\uFF08\u5FC5\u987B\u8F6C\u5316\u4E3A\u7269\u7406\u52A8\u4F5C\uFF09
- \u8F93\u51FA\u4EFB\u4F55 JSON \u7ED3\u6784\u5316\u5B57\u6BB5\uFF08\u5982 shotSize: "\u7279\u5199"\uFF09
- \u51FA\u73B0\u300C0-3s\u300D\u300C3-5\u79D2\u300D\u7B49\u7EDD\u5BF9\u65F6\u95F4\u5207\u7247
- \u628A\u300CA/B/C \u9009\u62E9\u9879\u300D\u300C\u9009\u62E9\u6D6E\u73B0\u300D\u8FD9\u7C7B\u6E38\u620F\u903B\u8F91\u6587\u672C\u5199\u8FDB seedancePrompt

\u3010\u53F0\u8BCD\u8868\u6F14\u56DB\u8981\u7D20\u516C\u5F0F \xB7 \u542B\u53F0\u8BCD\u955C\u5934\u7684\u753B\u9762\u5185\u5BB9\u6BB5\u5FC5\u987B\u9075\u5FAA\u3011
\u573A\u666F\u6C1B\u56F4\uFF08\u5149\u7EBF/\u7A7A\u95F4\u5982\u4F55\u5F71\u54CD\u89D2\u8272\u60C5\u7EEA\u7A7A\u6C14\uFF09
\u2192 \u4EBA\u7269\u5185\u5FC3\u72B6\u6001\uFF08\u75B2\u60EB/\u7D27\u5F20/\u72B9\u8C6B/\u6124\u6012/\u91CA\u7136\uFF09
\u2192 \u53D1\u58F0\u65B9\u5F0F\uFF08\u58F0\u97F3\u5927\u5C0F + \u8BED\u901F\u5FEB\u6162 + \u505C\u987F\u4F4D\u7F6E + \u5C3E\u97F3\u53D8\u5316\uFF09
\u2192 \u53E3\u578B\u7269\u7406\u52A8\u4F5C\uFF08\u4E0D\u5199\u53F0\u8BCD\u6587\u5B57\u672C\u8EAB\uFF0C\u53EA\u5199\u5634\u578B/\u5589\u7ED3/\u4E0B\u988C\u7684\u7269\u7406\u8868\u6F14\uFF09

\u6807\u70B9\u7B26\u53F7 \u2192 \u5634\u578B\u8BED\u6C14\u951A\u5B9A\uFF1A
  \xB7 \u95EE\u53F7\uFF08\uFF1F\uFF09\u2192 \u5C3E\u97F3\u4E0A\u626C\uFF0C\u5634\u578B\u6536\u7A84\u540E\u5FAE\u5F20\uFF0C\u7709\u6BDB\u8F7B\u63D0
  \xB7 \u611F\u53F9\u53F7\uFF08\uFF01\uFF09\u2192 \u52A0\u91CD\u54AC\u5B57\uFF0C\u5634\u578B\u5F20\u5F00\u5E45\u5EA6\u5927\uFF0C\u4E0B\u988C\u7528\u529B
  \xB7 \u7834\u6298\u53F7\uFF08\u2014\u2014\uFF09\u2192 \u62D6\u957F\u97F3/\u8F6C\u6298\uFF0C\u5634\u578B\u4FDD\u6301\u6216\u7A81\u7136\u53D8\u5316\uFF0C\u6C14\u606F\u62C9\u957F
  \xB7 \u7701\u7565\u53F7\uFF08\u2026\u2026\uFF09\u2192 \u8FDF\u7591\u7559\u767D\uFF0C\u5634\u5507\u7F13\u6162\u95ED\u5408\uFF0C\u6C14\u606F\u51CF\u5F31\uFF0C\u76EE\u5149\u6E38\u79FB
  \xB7 \u9017\u53F7\u505C\u987F \u2192 \u8F7B\u54BD\u4E00\u6B21\uFF0C\u5507\u8F7B\u95ED 0.3s`;
function buildSeedanceShotSequenceProtocol(artStylePreset) {
  const isStylized = [
    "anime",
    "anime-cel",
    "anime-painterly",
    "anime-dark",
    "chibi-kawaii",
    "illustration",
    "watercolor",
    "concept-art",
    "comic-strip",
    "storybook",
    "ukiyo-e"
  ].includes(String(artStylePreset ?? ""));
  const styleHint = isStylized ? "\u5982\u4E3A\u52A8\u6F2B/\u63D2\u753B/\u975E\u5199\u5B9E\u9879\u76EE\uFF0C\u5FC5\u987B\u5728\u672B\u53E5\u660E\u786E\u76EE\u6807\u98CE\u683C\uFF0C\u4F8B\u5982\u300C2D \u65E5\u6F2B\u98CE\u683C\u300D\u300C\u56FD\u98CE\u6F2B\u753B\u8D28\u611F\u300D\uFF0C\u907F\u514D\u6F02\u79FB\u6210\u771F\u4EBA\u5199\u5B9E\u3002" : "\u5982\u4E3A\u5199\u5B9E\u9879\u76EE\uFF0C\u4F7F\u7528\u300C\u7535\u5F71\u8D28\u611F\u3001\u8272\u5F69\u81EA\u7136\u3001\u5149\u5F71\u67D4\u548C\u300D\u8FD9\u7C7B\u8F7B\u91CF\u98CE\u683C\u8BCD\uFF0C\u4E0D\u5806\u6444\u5F71\u673A\u578B\u53F7\u6216\u955C\u5934\u54C1\u724C\u3002";
  return `\u3010Seedance 2 V2 \u955C\u5934\u5E8F\u5217\u534F\u8BAE\uFF08\u6BCF\u4E2A shot \u7684 seedancePrompt \u5FC5\u987B\u9075\u5FAA\uFF09\u3011

\u8F93\u51FA\u5F62\u6001\uFF1A
- \u6BCF\u4E2A seedancePrompt \u53EA\u5199 1-4 \u884C\u300C\u955C\u5934N\uFF1A...\u300D\u3002
- \u4F7F\u7528\u300C\u955C\u59341 / \u955C\u59342 / \u2026\u300D\u8868\u8FBE\u4E8B\u4EF6\u987A\u5E8F\uFF1B\u7981\u6B62\u5199\u300C0-3s\u300D\u300C3-5\u79D2\u300D\u7B49\u7EDD\u5BF9\u65F6\u95F4\u5207\u7247\u3002
- \u4E0D\u5199\u300C\u7B2C 1 \u6BB5 / \u6C1B\u56F4\u4E0E\u753B\u8D28 / \u771F\u5B9E\u8D28\u611F / \u58F0\u97F3\u73AF\u5883\u300D\u7B49\u4E94\u6BB5\u5F0F\u6807\u9898\u3002

\u6BCF\u884C\u516C\u5F0F\uFF1A
\`\u955C\u5934N\uFF1A\u5355\u4E00\u8FD0\u955C\u6216\u5207\u6362\u65B9\u5F0F\uFF0C\u666F\u522B/\u89D2\u5EA6\uFF0C\u4E3B\u4F53\u5177\u4F53\u52A8\u4F5C\u4E0E\u8868\u60C5\uFF0C\u4F4D\u7F6E/\u7A7A\u95F4\u53D8\u5316\uFF0C\u53EF\u9009\u58F0\u97F3\u6216\u73AF\u5883\u53CD\u9988\u3002\`

\u5199\u4F5C\u8981\u6C42\uFF1A
1. \u4E3B\u4F53\u6E05\u6670\uFF1A\u4F7F\u7528\u89D2\u8272\u540D\u6216\u7A33\u5B9A\u79F0\u8C13\uFF0C\u4E0D\u7528\u300C\u4ED6/\u5979/\u8FD9\u4E2A\u4EBA\u300D\u7B49\u6A21\u7CCA\u6307\u4EE3\u3002
2. \u52A8\u4F5C\u5177\u4F53\uFF1A\u5199\u624B\u3001\u817F\u3001\u5934\u3001\u80A9\u80CC\u3001\u773C\u795E\u3001\u5634\u578B\u3001\u547C\u5438\u7B49\u8EAB\u4F53\u7EC6\u8282\uFF0C\u8865\u5145\u5E45\u5EA6/\u901F\u5EA6/\u529B\u5EA6\u3002
3. \u60C5\u7EEA\u5916\u5316\uFF1A\u7981\u6B62\u53EA\u5199\u300C\u7D27\u5F20\u3001\u60B2\u4F24\u3001\u6124\u6012\u3001\u5F20\u529B\u4E0A\u626C\u300D\uFF1B\u5FC5\u987B\u6539\u6210\u300C\u6307\u8282\u6536\u7D27\u3001\u5589\u7ED3\u8F7B\u6EDA\u3001\u80A9\u8180\u5FAE\u98A4\u3001\u76EE\u5149\u56DE\u907F\u300D\u3002
4. \u4E00\u955C\u4E00\u8FD0\u955C\uFF1A\u5355\u4E2A\u300C\u955C\u5934N\u300D\u53EA\u80FD\u6307\u5B9A\u4E00\u79CD\u4E3B\u8FD0\u955C\uFF1B\u56FA\u5B9A\u673A\u4F4D / \u63A8\u955C / \u62C9\u955C / \u6A2A\u79FB / \u6447\u955C / \u8DDF\u62CD / \u73AF\u7ED5 / \u5347\u964D\u53EA\u80FD\u62E9\u4E00\u3002
5. \u4F4E\u7F13\u4F18\u5148\uFF1A\u65E0\u660E\u786E\u53C2\u8003\u89C6\u9891\u65F6\uFF0C\u4F18\u5148\u4F4E\u7F13\u3001\u8FDE\u7EED\u3001\u5C0F\u5E45\u52A8\u4F5C\uFF1B\u907F\u514D\u72C2\u5954\u3001\u5927\u8DF3\u3001\u7FFB\u6EDA\u7B49\u9AD8\u7206\u53D1\u52A8\u6001\u3002
6. \u4E92\u52A8\u9694\u79BB\uFF1A\u9009\u62E9\u9879\u3001\u6309\u94AE\u3001\u5206\u652F\u6587\u6848\u3001A/B/C \u65B9\u6848\u53EA\u5C5E\u4E8E\u6E38\u620F\u903B\u8F91\uFF0C\u7981\u6B62\u5199\u5165 seedancePrompt\uFF1B\u53EA\u8868\u73B0\u201C\u9009\u62E9\u538B\u529B\u201D\u5BF9\u5E94\u7684\u53EF\u89C1\u8EAB\u4F53\u53CD\u5E94\u6216\u9053\u5177\u7126\u70B9\u3002
7. \u53F0\u8BCD\u9694\u79BB\uFF1A\u53F0\u8BCD\u539F\u6587\u653E dialogueLine / voiceover \u5B57\u6BB5\uFF1BseedancePrompt \u53EA\u5199\u53E3\u578B\u3001\u505C\u987F\u3001\u547C\u5438\u3001\u4E0B\u988C\u3001\u5589\u7ED3\u7B49\u53EF\u89C6\u5316\u8868\u6F14\u3002
8. \u6536\u675F\u7EA6\u675F\uFF1A\u672B\u5C3E\u53EF\u7528\u4E00\u53E5\u8F7B\u91CF\u7EA6\u675F\uFF0C\u5305\u542B\u9AD8\u6E05\u3001\u7EC6\u8282\u4E30\u5BCC\u3001\u7535\u5F71\u8D28\u611F\u3001\u65E0\u5B57\u5E55\u3001\u65E0\u6C34\u5370\u3001\u65E0 Logo\u3001\u4EBA\u7269\u7A33\u5B9A\u4E0D\u53D8\u5F62\u3002${styleHint}

\u6B63\u4F8B\uFF1A
\u955C\u59341\uFF1A\u56FA\u5B9A\u673A\u4F4D\uFF0C\u4E2D\u666F\uFF0C\u6797\u665A\u5DE6\u624B\u538B\u4F4F\u65B9\u5411\u76D8\u8FB9\u7F18\uFF0C\u6307\u8282\u6162\u6162\u6CDB\u767D\uFF0C\u96E8\u5237\u53CD\u5149\u5212\u8FC7\u5979\u7D27\u7EF7\u7684\u4E0B\u988C\u3002
\u955C\u59342\uFF1A\u7F13\u6162\u63A8\u955C\uFF0C\u8FD1\u666F\uFF0C\u963F\u73CD\u53CC\u5507\u5FAE\u5F20\u53C8\u95ED\u5408\uFF0C\u5589\u7ED3\u8F7B\u6EDA\u4E00\u6B21\uFF0C\u53F3\u624B\u53CD\u590D\u6469\u6332\u5B89\u5168\u5E26\u6263\u3002
\u955C\u59343\uFF1A\u8F7B\u5FAE\u6A2A\u79FB\uFF0C\u5168\u666F\uFF0C\u8F66\u5185\u4E24\u4EBA\u4FDD\u6301\u539F\u6709\u65B9\u4F4D\uFF0C\u8FDC\u5904\u6E2F\u53E3\u96FE\u706F\u5728\u96E8\u5E55\u4E2D\u95EA\u70C1\uFF0C\u5239\u8F66\u58F0\u77ED\u4FC3\u54CD\u8D77\u3002

\u53CD\u4F8B\uFF1A
- \u7EDD\u5BF9\u79D2\u7EA7\u5207\u7247\uFF1A\u6797\u665A\u5F88\u7D27\u5F20\uFF0C\u955C\u5934\u63A8\u62C9\u6447\u79FB\uFF0C\u6C14\u6C1B\u5F20\u529B\u4E0A\u626C\u3002
- \u9009\u62E9\u6D6E\u73B0\uFF1AA\u6551\u4EBA\u53CD\u5835 / B\u593A\u5907\u4EFD\u76D8 / C\u903C\u4F4F\u6237\u4F5C\u8BC1\u3002
- \u89C6\u89C9\u57FA\u8C03\uFF1A\u5806\u53E0\u6444\u5F71\u673A\u578B\u53F7\u3001\u955C\u5934\u54C1\u724C\u548C\u65E7\u534F\u8BAE\u6807\u9898\u3002`;
}
var PHASE3_ANTI_SUBTITLE_RULES = `\u3010\u9632\u5B57\u5E55\u4E09\u94C1\u5F8B \xB7 \u6700\u9AD8\u4F18\u5148\u7EA7 \xB7 \u8FDD\u53CD\u5373\u5931\u8D25\u3011
Seedance 2 \u4F1A\u628A Prompt \u4E2D\u7684\u4EFB\u4F55\u6587\u5B57\u70E7\u5F55\u4E3A\u5C4F\u5E55\u5B57\u5E55\uFF0C\u5FC5\u987B\u4E25\u683C\u9075\u5B88\uFF1A

1. \u274C seedancePrompt \u4E2D\u4E25\u7981\u51FA\u73B0\u4EFB\u4F55\u53F0\u8BCD\u5B57\u9762\uFF08\u4E0D\u8BBA\u662F\u5426\u5E26\u5F15\u53F7\uFF09
   \u2705 \u6B63\u786E\uFF1A\u300C\u6797\u665A\u53E3\u578B\u6025\u4FC3\u5F00\u5408\uFF08\u7EA6 8 \u5B57\u8BED\u6D41\uFF09\uFF0C\u4E0B\u988C\u808C\u5FAE\u6296\uFF0C\u624B\u6307\u6263\u7D27\u65B9\u5411\u76D8\u4E0A\u6CBF\u300D
   \u274C \u9519\u8BEF\uFF1A\u300C\u6797\u665A\u8BF4"\u518D\u665A\u5341\u5206\u949F\u5C31\u6765\u4E0D\u53CA\u4E86"\uFF0C\u63E1\u7D27\u65B9\u5411\u76D8\u300D

2. \u274C \u7981\u6B62\u300C\u8BF4\uFF1A\u300D\u300C\u95EE\u9053\uFF1A\u300D\u300C\u558A\uFF1A\u300D\u7B49"\u8A00\u8BF4\u52A8\u8BCD+\u5192\u53F7"\u53E5\u5F0F
   \u2705 \u6B63\u786E\uFF1A\u300C\u53CC\u5507\u7D27\u62BF\u540E\u7F13\u7F13\u5F20\u5F00\uFF0C\u53D1\u51FA\u58F0\u97F3\u300D
   \u274C \u9519\u8BEF\uFF1A\u300C\u6797\u665A\u95EE\u9053\uFF1A'\u4F60\u662F\u8C01\uFF1F'\u300D

3. \u274C \u7981\u6B62\u300C<\u89D2\u8272\u540D>\uFF1A"\u2026"\u300D\u683C\u5F0F
   \u2705 \u6B63\u786E\uFF1A\u300C\u5BF9\u9762\u7684\u5973\u4EBA\u5634\u5507\u5FAE\u52A8\uFF0C\u76EE\u5149\u9501\u5B9A\u955C\u5934\u300D
   \u274C \u9519\u8BEF\uFF1A\u300C\u6797\u665A\uFF1A'\u6211\u77E5\u9053\u771F\u76F8\u4E86'\u300D

\u3010\u8868\u8FBE"\u5728\u8BF4\u8BDD"\u7684\u5408\u89C4\u5199\u6CD5\u3011
- \u53E3\u578B\u8282\u594F\uFF1A\u300C\u53E3\u578B\u6025\u4FC3\u5F00\u5408\uFF08\u7EA6 X \u5B57\u8BED\u6D41\uFF09\u300D\u300C\u53CC\u5507\u7D27\u62BF\u540E\u7F13\u7F13\u5F20\u5F00\u300D
- \u503E\u542C\u53CD\u5E94\uFF1A\u300C\u7709\u68A2\u4E0A\u6311\u534A\u5EA6\u300D\u300C\u6307\u8282\u5728\u684C\u9762\u65E0\u610F\u8BC6\u6536\u7D27\u300D
- \u975E\u8A00\u8BED\u56DE\u5E94\uFF1A\u300C\u4EE5\u4E00\u6B21\u7F13\u6162\u541E\u54BD\u4F5C\u7B54\u300D\u300C\u4E0B\u988C\u808C\u8F7B\u5FAE\u7D27\u7EF7\u4E09\u6B21\u300D`;
var PHASE3_CROSS_SHOT_CONSISTENCY = `\u3010\u8DE8\u955C\u5934\u4E00\u81F4\u6027\u786C\u7EA6\u675F \xB7 \u8F93\u51FA\u524D\u5FC5\u987B\u81EA\u68C0\u3011
\u540C\u8282\u70B9\u5185\u6240\u6709\u955C\u5934\u5FC5\u987B\u4FDD\u6301\u4EE5\u4E0B 5 \u9879 100% \u4E00\u81F4\uFF0C\u4EFB\u4F55\u4E0D\u4E00\u81F4\u5373\u4E3A\u7A7F\u5E2E\uFF1A

1. \u3010\u5149\u7EBF\u6307\u7EB9\u3011\u5149\u6E90\u65B9\u5411 + \u8272\u6E29 + \u5F3A\u5EA6\u5B8C\u5168\u4E00\u81F4
   \u2705 \u6B63\u786E\uFF1A\u6240\u6709\u955C\u5934\u90FD\u662F\u300C\u5934\u9876\u51B7\u767D\u65E5\u5149\u706F\uFF0C\u6B63\u4E0A\u65B9\u7167\u5C04\uFF0C6500K\u300D
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u662F\u6696\u5149\uFF0C\u540E\u955C\u53D8\u6210\u51B7\u5149

2. \u3010\u7A7A\u95F4\u65B9\u4F4D\u3011\u4E3B\u4F53\u4F4D\u7F6E + \u9762\u671D\u65B9\u5411 + \u5DE6\u53F3\u5173\u7CFB\u4E0D\u53D8
   \u2705 \u6B63\u786E\uFF1A\u4E3B\u89D2\u59CB\u7EC8\u5728\u753B\u9762\u5DE6 1/3\uFF0C\u9762\u671D\u53F3\u65B9
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u4E3B\u89D2\u5728\u5DE6\u8FB9\uFF0C\u540E\u955C\u7A81\u7136\u8DD1\u5230\u53F3\u8FB9

3. \u3010\u670D\u88C5\u9053\u5177\u3011\u670D\u88C5\u6B3E\u5F0F\u989C\u8272\u3001\u9053\u5177\u4F4D\u7F6E\u72B6\u6001\u4E0D\u53D8
   \u2705 \u6B63\u786E\uFF1A\u4E3B\u89D2\u4E00\u76F4\u7A7F\u7740\u84DD\u8272\u5916\u5957\uFF0C\u5DE6\u624B\u62FF\u7740\u624B\u673A
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u5916\u5957\u662F\u84DD\u8272\uFF0C\u540E\u955C\u53D8\u6210\u9ED1\u8272

4. \u3010\u65F6\u95F4\u5929\u6C14\u3011\u65F6\u95F4\u3001\u5929\u6C14\u3001\u5B63\u8282\u4E0D\u53D8\uFF08\u9664\u975E\u660E\u786E\u95EA\u56DE\uFF09
   \u2705 \u6B63\u786E\uFF1A\u6240\u6709\u955C\u5934\u90FD\u662F\u300C\u591C\u665A\uFF0C\u4E0B\u7740\u5C0F\u96E8\u300D
   \u274C \u9519\u8BEF\uFF1A\u524D\u955C\u5728\u4E0B\u96E8\uFF0C\u540E\u955C\u96E8\u505C\u4E86

5. \u3010\u6807\u5FD7\u7269\u56DE\u58F0\u3011\u9996\u955C\u5EFA\u7ACB\u7684\u6838\u5FC3\u6807\u5FD7\u7269\u81F3\u5C11\u5728\u540E\u7EED\u955C\u5934\u590D\u73B0 1 \u6B21`;
var PHASE3_POV_WRITING_RULES = `\u3010\u7B2C\u4E00\u4EBA\u79F0 POV \u955C\u5934\u5E8F\u5217\u5199\u6CD5\u786C\u7EA6\u675F \xB7 \u6240\u6709\u955C\u5934\u5FC5\u987B\u9075\u5FAA\u3011

\u672C\u9879\u76EE\u91C7\u7528\u7B2C\u4E00\u4EBA\u79F0 POV \u89C6\u89D2\uFF08\u6444\u5F71\u673A = \u4E3B\u89D2\u773C\u775B\uFF09\u3002\u751F\u6210\u6BCF\u4E2A seedancePrompt \u65F6\u5FC5\u987B\u9075\u5FAA\u4EE5\u4E0B\u89C4\u5219\uFF1A

\u8FD0\u955C\uFF08POV \u4E13\u7528\uFF09\uFF1A
- \u666F\u522B**\u7981\u6B62\u5199**\u300C\u7279\u5199\u300D\u300C\u8FD1\u666F\u300D\u2014\u2014POV \u89C6\u89D2\u6CA1\u6709"\u62CD\u81EA\u5DF1"\u7684\u6982\u5FF5
- \u666F\u522B\u6539\u5199\u4E3A\u5BF9**\u6240\u770B\u4E8B\u7269**\u7684\u63CF\u8FF0\uFF1A\u300C\u773C\u524D\u4E2D\u666F\u300D\u300C\u89C6\u7EBF\u8303\u56F4\u5185\u8FDC\u666F\u300D\u300C\u4F4E\u5934\u8FD1\u8DDD\u79BB\u300D
- \u8FD0\u955C**\u53EA\u5141\u8BB8**\uFF1A\u81EA\u7136\u5934\u90E8\u8F6C\u52A8 / \u89C6\u7EBF\u8F6C\u79FB / \u524D\u8FDB/\u540E\u9000\u6B65\u4F10\u5E26\u52A8 / \u8F7B\u5FAE\u624B\u6301\u547C\u5438\u6D6E\u52A8
- \u8FD0\u955C**\u7981\u6B62**\uFF1A\u73AF\u7ED5 / \u5F27\u5F62 / \u5347\u964D / \u4FEF\u77B0 / \u4EFB\u4F55\u66B4\u9732\u4E3B\u89D2\u5168\u8C8C\u7684\u673A\u4F4D
- \u6BCF\u955C\u5934**\u5FC5\u987B\u5199**\uFF1A\u300C\u624B\u6301\u62CD\u6444\uFF0C\u5168\u7A0B\u8F7B\u5FAE\u81EA\u7136\u547C\u5438\u6D6E\u52A8\u4E0E\u5934\u90E8\u5FAE\u6446\u300D

\u753B\u9762\u5185\u5BB9\uFF08POV \u4E13\u7528\uFF09\uFF1A
- **\u4E3B\u89D2\u4E0D\u4F5C\u4E3A\u753B\u9762\u4E2D\u88AB\u89C2\u5BDF\u7684\u5BF9\u8C61**\uFF08\u7981\u6B62\u5199\u300C\u4E3B\u89D2\u7AD9\u5728...\u300D\u300C\u4E3B\u89D2\u7684\u8868\u60C5...\u300D\uFF09
- \u6539\u4E3A\u5199**\u4E3B\u89D2\u770B\u5230\u7684\u4E16\u754C**\uFF1A\u300C\u773C\u524D\u51FA\u73B0...\u300D\u300C\u89C6\u7EBF\u4E0B\u79FB\u770B\u5230\u81EA\u5DF1\u7684\u624B...\u300D\u300C\u5BF9\u9762\u7684\u4EBA\u5F00\u53E3\u8BF4...\u300D
- \u4E3B\u89D2\u624B\u90E8\u52A8\u4F5C\u7528\u300C\u624B\u4ECE\u753B\u9762\u4E0B\u65B9\u4F38\u51FA\u300D\u300C\u53F3\u624B\u62AC\u8D77\u89E6\u78B0\u300D\u7B49\u5165\u753B\u5F0F\u63CF\u5199
- \u5176\u4ED6\u89D2\u8272**\u9762\u671D\u955C\u5934\u65B9\u5411**\u8BF4\u8BDD/\u4E92\u52A8\uFF08\u5236\u9020\u5BF9\u7740\u89C2\u4F17\u7684\u6C89\u6D78\u611F\uFF09
- \u60C5\u7EEA\u901A\u8FC7**\u751F\u7406\u53CD\u5E94**\u4F20\u9012\u800C\u975E\u9762\u90E8\u63CF\u5199\uFF08\u5FC3\u8DF3\u52A0\u901F\u2192\u753B\u9762\u8F7B\u5FAE\u6296\u52A8 / \u7D27\u5F20\u2192\u624B\u6307\u98A4\u6296 / \u7729\u6655\u2192\u753B\u9762\u503E\u659C\uFF09

\u58F0\u97F3\uFF08POV \u4E13\u7528\uFF09\uFF1A
- **\u5FC5\u987B\u542B\u4E3B\u89D2\u751F\u7406\u97F3\u6548**\uFF1A\u547C\u5438\u58F0 / \u5FC3\u8DF3 / \u541E\u54BD / \u8863\u6599\u6469\u64E6
- \u5BF9\u8BDD\u7C7B\u8282\u70B9\uFF1A\u5176\u4ED6\u89D2\u8272\u7684\u58F0\u97F3\u4ECE\u300C\u6B63\u524D\u65B9/\u4FA7\u65B9\u300D\u4F20\u6765\uFF08\u7ED9\u7A7A\u95F4\u5B9A\u4F4D\u611F\uFF09

\u2501\u2501\u2501 POV \u7981\u6B62\u4E8B\u9879\uFF08\u6700\u9AD8\u4F18\u5148\u7EA7\uFF09 \u2501\u2501\u2501
- \u7981\u6B62\u5199\u300C\u4E3B\u89D2\u8F6C\u8EAB\u300D\u300C\u4E3B\u89D2\u56DE\u5934\u770B\u300D\u7B49\u4F1A\u66B4\u9732\u4E3B\u89D2\u5168\u8C8C\u7684\u63CF\u5199
- \u7981\u6B62\u5199\u4E3B\u89D2\u7684\u9762\u90E8\u8868\u60C5\uFF08\u6444\u5F71\u673A\u662F\u773C\u775B\uFF0C\u770B\u4E0D\u5230\u81EA\u5DF1\u7684\u8138\uFF09
- \u7981\u6B62\u51FA\u73B0\u4E3B\u89D2\u6B63\u9762/\u4FA7\u9762/\u80CC\u5F71\u7684\u4EFB\u4F55\u63CF\u5199
- \u552F\u4E00\u5141\u8BB8\u7684\u4E3B\u89D2\u8EAB\u4F53\u63CF\u5199\uFF1A\u624B/\u624B\u81C2/\u4F4E\u5934\u53EF\u89C1\u7684\u8EAF\u5E72\u524D\u90E8/\u5F71\u5B50`;
var PHASE3_CHARACTER_INFO_HEADER = "\u3010\u89D2\u8272\u4FE1\u606F\u3011";
var PHASE3_LOCATION_INFO_HEADER = "\u3010\u573A\u666F\u8BE6\u7EC6\u4FE1\u606F\u3011";
var PHASE3_PREV_VISUAL_ANCHORS_HEADER = "\u3010\u524D\u7F6E\u6536\u5C3E\u753B\u9762\u3011\u524D\u4E00\u8282\u70B9\u672B\u5C3E\u89C6\u89C9\u951A\u70B9\uFF0C\u672C\u8282\u70B9\u9996\u955C\u5F00\u573A\u6784\u56FE\u5E94\u4E0E\u4E4B\u5728\u7A7A\u95F4/\u5149\u5F71\u4E0A\u8FDE\u7EED\uFF1A";
var PHASE3_PREV_VISUAL_ANCHORS_FALLBACK = "\uFF08\u6B64\u4E3A\u5F00\u573A\u8282\u70B9\uFF0C\u65E0\u524D\u7F6E\uFF09";
var PHASE3_NEXT_ANCHORS_HEADER = "\u3010\u540E\u7EED\u9996\u5E27\u951A\u70B9\u3011\u672C\u8282\u70B9\u672B\u955C\u5934\u5E94\u4E3A\u4E0B\u6E38\u8282\u70B9\u9996\u5E27\u7559\u51FA\u89C6\u89C9\u63A5\u53E3\uFF1A";
var PHASE3_NEXT_ANCHORS_FALLBACK = "\uFF08\u672C\u8282\u70B9\u4E3A\u7ED3\u5C40\u6216\u65E0\u540E\u7EED\uFF09";
var PHASE3_DIALOGUE_BIBLE_HEADER = "\u3010\u5BF9\u767D\u5723\u7ECF\u3011\uFF08\u53F0\u8BCD\u5206\u914D\u5230 dialogueLine \u5B57\u6BB5\uFF0CseedancePrompt \u4E2D\u53EA\u5199\u53E3\u578B/\u8868\u6F14\u52A8\u4F5C\uFF09\uFF1A";
var PHASE3_SCREENPLAY_SOURCE_HEADER = "\u3010\u539F\u59CB\u5267\u672C\u6BB5\u843D \xB7 \u5206\u955C\u552F\u4E00\u6743\u5A01\u6765\u6E90\u3011";
var PHASE3_SCREENPLAY_FIDELITY_RULES = `\u3010\u5267\u672C\u5FE0\u5B9E\u5EA6\u94C1\u5F8B \xB7 \u6700\u9AD8\u4F18\u5148\u7EA7\u3011
\u672C\u8282\u70B9\u7684\u5206\u955C\u5FC5\u987B 100% \u57FA\u4E8E\u4E0A\u65B9\u3010\u539F\u59CB\u5267\u672C\u6BB5\u843D\u3011\u7684\u5185\u5BB9\u521B\u4F5C\uFF0C\u4E0D\u53EF\u81EA\u7531\u53D1\u6325\uFF1A

1. \u274C \u7981\u6B62\u65B0\u589E\u5267\u672C\u4E2D\u4E0D\u5B58\u5728\u7684\u89D2\u8272\u3001\u52A8\u4F5C\u3001\u53F0\u8BCD\u3001\u9053\u5177\u6216\u4E8B\u4EF6
2. \u274C \u7981\u6B62\u7BE1\u6539\u89D2\u8272\u95F4\u7684\u5BF9\u8BDD\u5185\u5BB9\u6216\u5148\u540E\u987A\u5E8F
3. \u274C \u7981\u6B62\u9057\u6F0F\u5267\u672C\u6BB5\u843D\u4E2D\u7684\u5173\u952E\u52A8\u4F5C\u6807\u8BB0\uFF08\u25B3\uFF09\u3001OS/VO\u3001\u7A7A\u955C\u548C\u53F0\u8BCD
4. \u2705 \u6BCF\u4E2A shot \u7684\u753B\u9762\u5185\u5BB9\u6BB5\u5FC5\u987B\u80FD\u5728\u539F\u59CB\u5267\u672C\u6BB5\u843D\u4E2D\u627E\u5230\u5BF9\u5E94\u7684\u6587\u672C\u951A\u70B9
5. \u2705 dialogueLine \u5B57\u6BB5\u5FC5\u987B\u5B8C\u5168\u5F15\u7528\u5267\u672C\u4E2D\u7684\u53F0\u8BCD\u539F\u6587\uFF08\u4E00\u5B57\u4E0D\u6539\uFF09
6. \u2705 \u53EF\u4EE5\u8865\u5145\u955C\u5934\u8FD0\u52A8\u3001\u5149\u5F71\u7EC6\u8282\u3001\u7269\u7406\u8D28\u611F\u7B49"\u89C6\u89C9\u5BFC\u6F14\u5C42"\u63CF\u5199\uFF0C\u4F46\u53D9\u4E8B\u9AA8\u67B6\u5FC5\u987B\u5FE0\u4E8E\u5267\u672C
7. \u2705 \u5267\u672C\u4E2D\u7684\u821E\u53F0\u52A8\u4F5C\uFF08\u25B3\u5F00\u5934\uFF09\u548C\u3010\u7A7A\u955C\u3011\u662F\u753B\u9762\u5185\u5BB9\u6BB5\u7684\u76F4\u63A5\u7D20\u6750\u6765\u6E90

\u81EA\u68C0\uFF1A\u9010 shot \u68C0\u67E5\uFF0C\u6BCF\u4E2A shot \u7684\u6838\u5FC3\u4E8B\u4EF6\u662F\u5426\u90FD\u6765\u81EA\u3010\u539F\u59CB\u5267\u672C\u6BB5\u843D\u3011\u3002\u5982\u6709\u4EFB\u4F55\u81EA\u7531\u521B\u4F5C\u6210\u5206\uFF0C\u5220\u9664\u5E76\u91CD\u5199\u3002`;
var PHASE3_FINAL_CHECKLIST = `\u3010\u8F93\u51FA\u524D\u5FC5\u987B\u5B8C\u6210\u7684\u81EA\u68C0\u6E05\u5355\u3011
\u2705 \u6240\u6709 seedancePrompt \u90FD\u4E25\u683C\u9075\u5FAA Seedance V2 \u955C\u5934\u5E8F\u5217\u7ED3\u6784
\u2705 seedancePrompt \u4E2D\u6CA1\u6709\u4EFB\u4F55\u53F0\u8BCD\u6587\u5B57\u6216\u8A00\u8BF4\u52A8\u8BCD
\u2705 \u6240\u6709\u60C5\u7EEA\u90FD\u901A\u8FC7\u5177\u4F53\u7269\u7406\u52A8\u4F5C\u8868\u8FBE\uFF08\u65E0"\u5F88\u7D27\u5F20""\u5F88\u5F00\u5FC3"\u7B49\u62BD\u8C61\u63CF\u8FF0\uFF09
\u2705 \u6CA1\u6709 0-3s / 3-5\u79D2 \u7B49\u7EDD\u5BF9\u65F6\u95F4\u5207\u7247
\u2705 \u6CA1\u6709\u9009\u62E9\u6D6E\u73B0\u3001A/B/C \u9009\u9879\u6587\u6848\u6216\u6309\u94AE\u6587\u672C
\u2705 \u6BCF\u4E2A\u955C\u5934\u53EA\u5305\u542B\u4E00\u79CD\u4E3B\u8FD0\u955C
\u2705 \u540C\u8282\u70B9\u5185\u5149\u7EBF\u3001\u670D\u88C5\u3001\u9053\u5177\u3001\u65B9\u4F4D\u5B8C\u5168\u4E00\u81F4\uFF085 \u9879\u4E00\u81F4\u6027\uFF09
\u2705 \u6240\u6709\u955C\u5934\u65F6\u957F\u4E4B\u548C\u7B49\u4E8E\u603B\u65F6\u957F\uFF08\xB1${DURATION_TOLERANCE_SECONDS}s\uFF09
\u2705 \u5355\u955C\u5934\u65F6\u957F\u5728 ${MIN_SHOT_DURATION}-${MAX_SHOT_DURATION}s \u4E4B\u95F4
\u2705 POV \u955C\u5934\u6CA1\u6709\u51FA\u73B0\u4E3B\u89D2\u7684\u9762\u90E8\u6216\u5168\u8EAB
\u2705 \u4E92\u52A8\u8282\u70B9\u672B\u955C\u5934\u7B26\u5408\u9009\u62E9\u63ED\u793A\u89C4\u5219\uFF08\u773C\u795E/\u9053\u5177/\u73AF\u5883\u4E09\u9009\u4E00\uFF09

\u5C11\u4E00\u6761\u90FD\u4E0D\u8981\u8F93\u51FA\uFF0C\u56DE\u53BB\u4FEE\u6539\u76F4\u5230\u5168\u90E8\u6EE1\u8DB3\u3002`;
function buildPhase3OutputSchemaBlock(input) {
  return `\u3010\u8F93\u51FA\u683C\u5F0F \xB7 JSON \u6570\u7EC4\u3011
\u4E3A\u6B64\u8282\u70B9\u751F\u6210 ${input.shotCountRange} \u4E2A\u955C\u5934\uFF0C\u8FD4\u56DE\u4E25\u683C JSON \u6570\u7EC4\u3002\u6BCF\u4E2A\u5143\u7D20\u7ED3\u6784\uFF1A

{
  "shotNumber": 1,
  "durationSeconds": ${OPTIMAL_SHOT_DURATION},
  "seedancePrompt": "\uFF08Seedance V2 \u955C\u5934\u5E8F\u5217\u81EA\u7136\u8BED\u8A00 prompt\uFF0C\u89C1\u4E0A\u65B9\u534F\u8BAE\uFF09",
  "dialogueLine": "\u53F0\u8BCD\u539F\u6587\uFF08\u53EF\u9009\uFF0C\u65E0\u53F0\u8BCD\u65F6\u7701\u7565\u6B64\u5B57\u6BB5\uFF09",
  "voiceover": "\u65C1\u767D\u6587\u672C\uFF08\u53EF\u9009\uFF0C\u65E0\u65C1\u767D\u65F6\u7701\u7565\u6B64\u5B57\u6BB5\uFF09"
}

\u786C\u7EA6\u675F\uFF1A
- \u6240\u6709\u955C\u5934 durationSeconds \u4E4B\u548C\u5FC5\u987B\u7B49\u4E8E\u8282\u70B9\u7684 ${input.durationSeconds}s\uFF08\xB1${DURATION_TOLERANCE_SECONDS}s \u8BEF\u5DEE\uFF09
- \u5355\u955C\u5934\u65F6\u957F ${MIN_SHOT_DURATION}-${MAX_SHOT_DURATION}s\uFF0C\u63A8\u8350 ${OPTIMAL_SHOT_DURATION}s\uFF08Seedance 2 \u5355\u6BB5\u80FD\u529B\u533A\u95F4\uFF09
- seedancePrompt \u5FC5\u987B\u4E25\u683C\u9075\u5FAA Seedance V2 \u955C\u5934\u5E8F\u5217\u7ED3\u6784\uFF0C\u7EAF\u4E2D\u6587
- seedancePrompt \u5B57\u6570 ${MIN_PROMPT_LENGTH}-${MAX_PROMPT_LENGTH} \u5B57\uFF1B\u5B81\u53EF\u77ED\u800C\u5177\u4F53\uFF0C\u4E0D\u8981\u4E94\u6BB5\u5F0F\u957F\u6587
- dialogueLine \u53EA\u653E\u89D2\u8272\u53F0\u8BCD\u539F\u6587\uFF0C\u4E0D\u542B\u8868\u6F14\u63D0\u793A
- \u82E5\u586B\u5199 dialogueLine \u6216 voiceover\uFF0C\u8BE5\u955C\u5934 durationSeconds \u5FC5\u987B\u8DB3\u591F\u8986\u76D6\u5B8C\u6574\u53D1\u58F0\u3001\u6807\u70B9\u505C\u987F\u548C 0.5-1s \u53CD\u5E94\u7559\u767D\uFF1B\u4E0D\u5F97\u8BA9\u89C6\u9891\u5728\u8BDD\u6CA1\u8BF4\u5B8C\u524D\u7ED3\u675F
- \u4EC5\u8FD4\u56DE JSON \u6570\u7EC4\uFF0C\u4E0D\u8981\u8FFD\u52A0\u81EA\u7136\u8BED\u8A00\u8BF4\u660E\u6216 markdown \u4EE3\u7801\u5757`;
}
function buildPhase3ToneLockBlock(tone) {
  if (!tone) return "";
  return `\u3010\u9898\u6750\u9501\u5B9A\u3011\u672C\u9879\u76EE\u9898\u6750\u57FA\u8C03\u662F\u300C${tone}\u300D\uFF0C\u6240\u6709\u955C\u5934\u7684\u89C6\u89C9\u63CF\u8FF0\u3001\u6C1B\u56F4\u4E0E\u753B\u8D28\u6BB5\u5FC5\u987B\u5339\u914D\u300C${tone}\u300D\u9898\u6750\u65B9\u5411\u3002`;
}
function buildPhase3GlobalStyleBlock(globalStyle) {
  return `\u3010\u5168\u5C40\u98CE\u683C\u5173\u952E\u8BCD\u3011${globalStyle}
\uFF08LLM \u987B\u628A\u8FD9\u4E9B\u5173\u952E\u8BCD\u81EA\u7136\u878D\u5165\u6BCF\u4E2A seedancePrompt \u7684\u300C\u6C1B\u56F4\u4E0E\u753B\u8D28\u300D\u6BB5\uFF0C\u4E0D\u8981\u751F\u786C\u5806\u53E0\u3002\uFF09`;
}
function buildPhase3ChapterBlock(ctx) {
  if (!ctx) return "";
  return `\u3010\u7AE0\u8282\u80CC\u666F\u3011
- \u5F53\u524D\u7AE0\u8282\uFF1A\u7B2C ${ctx.chapterNumber} / ${ctx.totalChapters} \u5E55
- \u7AE0\u8282\u620F\u5267\u529F\u80FD\uFF1A${ctx.dramaticFunction}
- \u672C\u7AE0\u8282\u7B80\u62A5\uFF1A${ctx.chapterBrief}
- \u524D\u60C5\u6458\u8981\uFF1A${ctx.priorChaptersDigest || "\uFF08\u6B64\u4E3A\u5F00\u7BC7\u7AE0\u8282\uFF0C\u65E0\u524D\u60C5\uFF09"}`;
}
function buildPhase3NodeInfoBlock(input) {
  return `\u3010\u5F53\u524D\u8282\u70B9\u4FE1\u606F\u3011
- tempId\uFF1A${input.tempId}
- \u6807\u9898\uFF1A${input.title}
- \u5267\u60C5\u6B63\u6587\uFF1A${input.storyText}
- \u65F6\u957F\uFF1A${input.durationSeconds}s
- \u53D9\u4E8B\u89D2\u8272\uFF1A${input.narrativeRole || "\u5E38\u89C4"}
- \u89C6\u9891\u610F\u56FE\uFF1A${input.videoIntent}
- \u9009\u62E9\u94FA\u57AB\uFF1A${input.choiceSetup}
- \u89C6\u89C9\u951A\u70B9\uFF1A${input.visualAnchors}
- \u58F0\u97F3\u7EBF\u7D22\uFF1A${input.soundCues}`;
}
function buildPhase3InteractiveConstraintsBlock(input) {
  if (!input.applyChoiceRevealRule) {
    return "\u3010\u4E92\u52A8\u7EA6\u675F\u3011\u672C\u8282\u70B9\u4E0D\u89E6\u53D1\u9009\u62E9\u63ED\u793A\u955C\u5934\u89C4\u5219\uFF08\u7ED3\u5C40\u6216\u65E0\u5206\u652F\uFF09\u3002";
  }
  return `\u3010\u4E92\u52A8\u5F71\u6E38\u955C\u5934\u786C\u7EA6\u675F\u3011
\u672C\u8282\u70B9\u6709 ${input.choicesLength} \u4E2A\u9009\u62E9\u4E14\u975E\u7ED3\u5C40\uFF1A
1. \u672B\u955C\u5934\u5FC5\u987B\u6EE1\u8DB3\uFF1A\u955C\u5934\u63A8\u8FD1\u4E3B\u89D2\u773C\u775B(\u7279\u5199) / \u753B\u9762\u5B9A\u683C\u5728\u6289\u62E9\u7269\u4EF6 / \u7559 2-3s \u547C\u5438\u7A7A\u95F4
2. \u672B\u955C\u5934\u7684\u753B\u9762\u5185\u5BB9\u6BB5\u5FC5\u987B\u542B\u81F3\u5C11 1 \u6761\u808C\u8089\u52A8\u4F5C\u7EA7\u63CF\u8FF0\uFF08\u7709\u5FC3/\u5634\u89D2/\u6307\u8282/\u5589\u7ED3\uFF09
3. \u672B\u955C\u5934\u300C\u58F0\u97F3\u73AF\u5883\u300D\u6BB5\u5FC3\u8DF3\u6216\u6DF1\u547C\u5438\u4E0A\u626C\uFF0C\u6A21\u62DF\u73A9\u5BB6\u601D\u8003\u538B\u529B`;
}
function getShotCount(durationSeconds) {
  if (durationSeconds <= 0) return 1;
  return Math.max(1, Math.ceil(durationSeconds / MAX_SHOT_DURATION));
}
function deriveShotCountRange(durationSeconds) {
  const estimatedShots = Math.max(4, Math.min(6, Math.round(durationSeconds / OPTIMAL_SHOT_DURATION)));
  return `${Math.max(4, estimatedShots - 1)}-${Math.min(8, estimatedShots + 1)}`;
}
function buildNodeShotScriptPrompt(input) {
  const applyChoiceRevealRule = (input.choicesLength ?? 0) >= 2 && !input.isEnding;
  const isPov = input.perspective === "\u7B2C\u4E00\u4EBA\u79F0";
  const toneLockBlock = buildPhase3ToneLockBlock(input.tone);
  const perspectiveBlock = buildPerspectiveLockBlock(input.perspective, "phase3");
  const globalStyle = (input.styleKeywords ?? []).join("\uFF0C");
  const globalStyleBlock = globalStyle ? buildPhase3GlobalStyleBlock(globalStyle) : "";
  const chapterBlock = buildPhase3ChapterBlock(input.chapterContext);
  const involvedChars = (input.characters ?? []).length > 0 ? (input.characters ?? []).map((c) => {
    const head = c.role ? `${c.name}\uFF08${c.role}\uFF09` : c.name;
    return c.appearance ? `${head}\uFF1A${c.appearance}` : head;
  }).join("\n") : "\u65E0\u89D2\u8272\u4FE1\u606F";
  const locationBlock = input.location?.trim() || "\u672A\u6307\u5B9A\u573A\u666F";
  const nodeInfoBlock = buildPhase3NodeInfoBlock({
    tempId: input.nodeName,
    title: input.nodeName,
    storyText: input.storyText,
    durationSeconds: input.durationSeconds,
    narrativeRole: input.narrativeRole ?? "",
    videoIntent: input.videoIntent ?? "\u65E0",
    choiceSetup: input.choiceSetup ?? "\u65E0",
    visualAnchors: input.visualAnchors?.join("\u3001") ?? "\u65E0",
    soundCues: input.soundCues?.join("\u3001") ?? "\u65E0"
  });
  const screenplaySource = input.screenplay?.trim() ?? "";
  const variableSnapshotBlock = input.variableSnapshot && Object.keys(input.variableSnapshot).length > 0 ? `\u3010\u53D8\u91CF\u72B6\u6001 \u2192 \u8868\u6F14\u57FA\u8C03\u3011
\u5F53\u524D\u53D8\u91CF\uFF1A${Object.entries(input.variableSnapshot).map(([k, v]) => `${k}=${v}`).join("\uFF0C")}
\uFF08\u955C\u5934\u8BED\u8A00\u987B\u4F53\u73B0\u53D8\u91CF\u503C\u5BF9\u89D2\u8272\u72B6\u6001\u7684\u5F71\u54CD\uFF1A\u9AD8\u4FE1\u4EFB\u2192\u80A2\u4F53\u5F00\u653E/\u773C\u795E\u76F4\u89C6\uFF1B\u4F4E\u4FE1\u4EFB\u2192\u62D8\u8C28/\u56DE\u907F\uFF1B\u9AD8\u52C7\u6C14\u2192\u52A8\u4F5C\u679C\u51B3\uFF1B\u4F4E\u52C7\u6C14\u2192\u72B9\u8C6B/\u624B\u6307\u7EDE\u52A8\u3002\uFF09` : "";
  const prevVisualAnchors = (input.prevVisualAnchors ?? []).map((a) => `- ${a}`).join("\n");
  const nextAnchors = (input.nextAnchors ?? []).join("\n");
  const dialogueBibleBlock = input.dialogueBible?.trim() || "(\u672C\u8282\u70B9\u5728 dialogueBible \u4E2D\u65E0\u5BF9\u5E94\u6761\u76EE)";
  const outputSchemaBlock = buildPhase3OutputSchemaBlock({
    shotCountRange: input.shotCountRange ?? deriveShotCountRange(input.durationSeconds),
    durationSeconds: input.durationSeconds
  });
  const interactiveBlock = buildPhase3InteractiveConstraintsBlock({
    applyChoiceRevealRule,
    choicesLength: input.choicesLength ?? 0
  });
  const sections = [
    PHASE3_TASK_HEADLINE,
    buildSeedanceShotSequenceProtocol(input.artStyle),
    perspectiveBlock,
    isPov ? PHASE3_POV_WRITING_RULES : "",
    toneLockBlock,
    globalStyleBlock,
    chapterBlock,
    `${PHASE3_CHARACTER_INFO_HEADER}
${involvedChars}`,
    `${PHASE3_LOCATION_INFO_HEADER}
${locationBlock}`,
    nodeInfoBlock,
    variableSnapshotBlock,
    screenplaySource ? `${PHASE3_SCREENPLAY_SOURCE_HEADER}
${screenplaySource}` : "",
    screenplaySource ? PHASE3_SCREENPLAY_FIDELITY_RULES : "",
    `${PHASE3_PREV_VISUAL_ANCHORS_HEADER}
${prevVisualAnchors || PHASE3_PREV_VISUAL_ANCHORS_FALLBACK}`,
    `${PHASE3_NEXT_ANCHORS_HEADER}
${nextAnchors || PHASE3_NEXT_ANCHORS_FALLBACK}`,
    `${PHASE3_DIALOGUE_BIBLE_HEADER}
${dialogueBibleBlock}`,
    PHASE3_ANTI_SUBTITLE_RULES,
    PHASE3_CROSS_SHOT_CONSISTENCY,
    interactiveBlock,
    outputSchemaBlock,
    PHASE3_FINAL_CHECKLIST
  ];
  return sections.filter(Boolean).join("\n\n");
}

// server/engine/fmv/shot-image.ts
var VARIANT_HEADERS = {
  choice_pressure_frame: "\u7535\u5F71\u611F\u6289\u62E9\u538B\u529B\u5E27\u9759\u7167\uFF08\u9009\u62E9\u754C\u9762\u6D6E\u73B0\u77AC\u95F4\uFF09\u3002\u6838\u5FC3\u8981\u6C42\uFF1A\u5B9A\u683C\u5728\u547C\u5438\u505C\u987F\u7684\u5239\u90A3\uFF0C\u8425\u9020\u5F3A\u70C8\u7684\u51B3\u7B56\u5F20\u529B\uFF0C\u53F3\u4FA7\u9884\u7559 1/3 \u8D1F\u7A7A\u95F4\u7ED9\u9009\u9879 UI\u3002",
  video_first_frame: "\u7535\u5F71\u611F\u9996\u5E27\u9759\u7167\uFF08\u89C6\u9891\u751F\u6210\u89C6\u89C9\u951A\u70B9\uFF09\u3002\u6838\u5FC3\u8981\u6C42\uFF1A\u753B\u9762\u7A33\u5B9A\u3001\u6784\u56FE\u5B8C\u6574\u3001\u5149\u5F71\u51C6\u786E\uFF0C\u80FD\u591F\u4F5C\u4E3A\u89C6\u9891\u751F\u6210\u7684\u7B2C\u4E00\u5E27\u65E0\u7F1D\u5EF6\u7EED\u3002"
};
function buildNodeSummaryLine(title, trimmedBeat) {
  return `\u8282\u70B9\uFF1A${title}\u3002\u5267\u60C5\u8282\u62CD\uFF1A${trimmedBeat}\u3002`;
}
function buildPovLine(characterName) {
  return `\u6444\u50CF\u673A\u89C6\u89D2\uFF08POV\uFF09\uFF1A\u5B8C\u5168\u6A21\u62DF${characterName}\u7684\u773C\u775B\u6240\u89C1\u3002\u2705 \u53EF\u51FA\u73B0\uFF1A\u624B\u90E8\u3001\u524D\u81C2\u3001\u4F4E\u5934\u53EF\u89C1\u7684\u8EAF\u5E72\u524D\u90E8\u3001\u5F71\u5B50\u3002\u274C \u7EDD\u5BF9\u7981\u6B62\uFF1A${characterName}\u7684\u9762\u90E8\u3001\u5168\u8EAB\u3001\u80CC\u5F71\u3001\u4EFB\u4F55\u80FD\u770B\u5230\u5B8C\u6574\u8EAB\u4F53\u7684\u89D2\u5EA6\u3002\u753B\u9762\u4E3B\u4F53\u662F${characterName}\u6240\u89C2\u5BDF\u5230\u7684\u573A\u666F\u548C\u5176\u4ED6\u89D2\u8272\uFF0C\u6240\u6709\u4E92\u52A8\u5BF9\u8C61\u90FD\u9762\u5411\u955C\u5934\u65B9\u5411\u3002`;
}
var VISUAL_ANCHORS_LABEL = "\u89C6\u89C9\u951A\u70B9";
var VISUAL_ANCHORS_SEPARATOR = "\uFF0C";
var ACTION_VISUALIZATION_PROTOCOL = [
  "\u3010\u52A8\u4F5C\u89C6\u89C9\u5316\u3011",
  "\u52A8\u4F5C\u5199\u5177\u4F53\u8EAB\u4F53\u90E8\u4F4D\u3001\u901F\u5EA6\u548C\u529B\u5EA6\uFF1B\u60C5\u7EEA\u8F6C\u6210\u624B\u3001\u80A9\u3001\u773C\u795E\u3001\u8DDD\u79BB\u3001\u9053\u5177\u72B6\u6001\uFF1B\u753B\u9762\u6355\u6349\u52A8\u6001\u5173\u952E\u5E27\uFF0C\u7981\u6B62\u9759\u6001\u6446\u62CD\u3002"
].join("\n");
var DIALOGUE_VISUALIZATION_PROTOCOL = [
  "\u3010\u53F0\u8BCD\u89C6\u89C9\u5316\u3011",
  "\u7981\u6B62\u753B\u9762\u6587\u5B57\u548C\u5BF9\u8BDD\u6C14\u6CE1\uFF1B\u53F0\u8BCD\u53EA\u901A\u8FC7\u5634\u578B\u5E45\u5EA6\u3001\u4E0B\u988C\u3001\u773C\u795E\u3001\u8EAB\u4F53\u524D\u503E/\u540E\u64A4\u548C\u505C\u987F\u8868\u73B0\uFF1B\u975E\u8BF4\u8BDD\u8005\u5634\u5507\u81EA\u7136\u95ED\u5408\u3002"
].join("\n");
var SHOT_IMAGE_QUALITY_CHECKLIST = [
  "\u3010\u955C\u5934\u56FE\u81EA\u68C0\u3011",
  "\u5355\u5E45\u5B8C\u6574\u753B\u9762\uFF1B\u89D2\u8272/\u573A\u666F/\u9053\u5177\u627F\u63A5\u53C2\u8003\u56FE\uFF1B\u52A8\u4F5C\u548C\u53F0\u8BCD\u53EF\u88AB\u770B\u89C1\uFF1B\u955C\u5934\u8BED\u8A00\u81F3\u5C11\u4F53\u73B0\u7126\u70B9\u3001\u666F\u522B\u3001\u89D2\u5EA6\u3001\u6784\u56FE\u3001\u5BF9\u7126\u6216\u5E03\u5149\u4E2D\u7684 4 \u9879\uFF1B\u65E0\u6587\u5B57/UI/\u6C34\u5370\uFF1B\u65E0\u7578\u5F62\u4EBA\u4F53\u3002"
].join("\n");
var FORBIDDEN_LINE = [
  "\u3010\u7981\u6B62\u3011",
  "\u65E0\u5B57\u5E55\u3001\u65E0\u8BF4\u660E\u6587\u5B57\u3001\u65E0 Logo\u3001\u65E0\u6C34\u5370\u3001\u65E0 UI\uFF1B\u4E0D\u5F97\u6539\u53D8\u53C2\u8003\u56FE\u4E2D\u7684\u8EAB\u4EFD\u3001\u670D\u88C5\u3001\u573A\u666F\u7ED3\u6784\u3001\u5149\u6E90\u65B9\u5411\u548C\u9053\u5177\u6750\u8D28\uFF1B\u4E0D\u5F97\u51FA\u73B0\u4EBA\u4F53\u7578\u5F62\u6216\u4F4E\u8D28\u6A21\u7CCA\u3002"
].join("\n");
var FRAMING_DESCRIPTIONS = {
  wide: "Wide establishing shot. The camera is far from the subject, showing the full environment and spatial relationships.",
  medium: "Medium shot. The camera frames the subject from roughly waist-up, keeping context visible but with the subject dominant.",
  close: "Close-up. The camera tightly frames the subject, with strong emphasis on facial expression or the single key object.",
  insert: "Insert shot. Extreme close-up on a small but significant detail (a prop, a hand, a fragment of text). Background is minimized.",
  ots: "Over-the-shoulder shot. Framed from behind one character\u2019s shoulder, looking toward another subject, keeping both in the frame.",
  pov: "Point-of-view shot. The camera takes the subject\u2019s eyes as its position; what appears is what the subject would see."
};
function trimTrailingStop(s) {
  return s.replace(/[。.\s]+$/, "");
}
function buildShotImagePrompt(input) {
  const variant = input.variant ?? "video_first_frame";
  const parts = [];
  parts.push(VARIANT_HEADERS[variant]);
  parts.push(buildNodeSummaryLine(input.nodeName, trimTrailingStop(input.beat)));
  if (variant === "choice_pressure_frame" && input.choiceRevealMoment?.trim()) {
    parts.push(`\u753B\u9762\u610F\u56FE\uFF08\u6289\u62E9\u6D6E\u73B0\u77AC\u95F4\u4E09\u5408\u4E00\uFF09\uFF1A${trimTrailingStop(input.choiceRevealMoment.trim())}\u3002`);
  }
  if (input.perspective === "\u7B2C\u4E00\u4EBA\u79F0") {
    const povName = input.characters?.[0]?.name;
    if (povName) parts.push(buildPovLine(povName));
  }
  if (input.uiStylePrompt?.trim()) parts.push(`Visual style: ${input.uiStylePrompt.trim()}.`);
  if (input.location?.trim()) {
    parts.push(
      `Location: ${input.location.trim()}. Match the lighting, spatial orientation, and mood of the provided reference image of this location.`
    );
  }
  if (input.characters?.length) {
    const anchors = input.characters.map((c) => c.appearance?.trim() ? `${c.name} (${c.appearance.trim()})` : c.name).join("; ");
    parts.push(
      `Characters present (visual anchors up-front): ${anchors}. Keep each character consistent with their provided turnaround reference \u2014 face, wardrobe, proportions, distinctive accessories.`
    );
  }
  const shotHeader = input.shotIndex !== void 0 && input.shotTotal !== void 0 ? `Shot ${input.shotIndex + 1} of ${input.shotTotal}.` : "Current shot.";
  parts.push(shotHeader);
  if (input.framing) parts.push(FRAMING_DESCRIPTIONS[input.framing]);
  if (input.cameraHint?.trim()) parts.push(`Camera direction: ${input.cameraHint.trim()}.`);
  if (input.beat.trim()) parts.push(`This shot shows: ${input.beat.trim()}.`);
  const audio = input.soundCues?.filter(Boolean).join("\uFF0C");
  if (audio) {
    parts.push(
      `Audio cues to externalize visually (AI cannot render sound \u2014 translate to visible physical evidence): ${audio}. For each sonic element, render a matching physical cue \u2014 e.g. raindrops crown-splashing on metal, dust floating in a beam of light, breath condensing into white mist, ripples on a puddle.`
    );
  }
  const dialogueText = input.dialogueLines?.filter(Boolean).join(" / ");
  if (dialogueText || input.subtext?.trim() || input.performance?.trim()) {
    const perfBits = [];
    if (dialogueText) {
      perfBits.push(
        `Character speaks (do NOT render text/subtitles in the image \u2014 only show the body language of speaking): "${dialogueText}"`
      );
    }
    if (input.performance?.trim()) perfBits.push(`Performance direction: ${input.performance.trim()}`);
    if (input.subtext?.trim())
      perfBits.push(`Subtext to externalize through micro-expression and posture: ${input.subtext.trim()}`);
    parts.push(
      `Performance & subtext: ${perfBits.join(" \xB7 ")}. Translate emotion into tensed jaw, whitened knuckles, reddened eye rims, shoulder posture, not into written words.`
    );
  }
  parts.push(ACTION_VISUALIZATION_PROTOCOL);
  if (input.visualAnchors?.length) {
    parts.push(`${VISUAL_ANCHORS_LABEL}\uFF1A${input.visualAnchors.join(VISUAL_ANCHORS_SEPARATOR)}\u3002`);
  }
  parts.push(DIALOGUE_VISUALIZATION_PROTOCOL);
  if (input.transitionHint?.trim()) {
    parts.push(
      `Transition to next shot: ${input.transitionHint.trim()}. Compose the end of this frame so it flows naturally into that transition.`
    );
  }
  parts.push(
    "Cinematic widescreen composition, 2.39:1 anamorphic letterbox aesthetic, film grain texture, high detail, clean frame."
  );
  parts.push(SHOT_IMAGE_QUALITY_CHECKLIST);
  parts.push(FORBIDDEN_LINE);
  return parts.filter(Boolean).join("\n");
}

// server/engine/fmv/shot-grid-templates.ts
var GRID_PANEL_COUNT = 6;
var LAYOUT_INSTRUCTION = [
  "LAYOUT CONTRACT: 16:9 storyboard table with EXACTLY 6 PANELS TOTAL.",
  "Use exactly 2 rows and 3 columns: row 1 has \u9762\u677F1-3, row 2 has \u9762\u677F4-6.",
  "Stop the storyboard after \u9762\u677F6. The final panel must be the strongest climax or ending freeze-frame.",
  "Under EACH panel, render one short Chinese story caption line describing that panel's plot beat.",
  "Each panel is a complete rough previsualization sketch with clear borders and no overlapping elements between panels."
].join(" ");
var PANEL5_ANCHOR_PREFIX = " \u8282\u70B9\u7EA7\u6444\u5F71\u951A\u70B9\uFF1A";
var PANEL5_ANCHOR_FIELD_LABELS = {
  angle: "\u6444\u5F71\u89D2\u5EA6",
  composition: "\u6784\u56FE",
  depthOfField: "\u666F\u6DF1"
};
function buildPanelNarrativeProtocol(panel5CameraAnchor) {
  return [
    "\u9762\u677F1\uFF5C\u5EFA\u7ACB\u73AF\u5883\uFF5C\u8FDC\u666F / \u5E7F\u89D2\uFF5C\u89D2\u8272\u4E0E\u573A\u666F\u5173\u7CFB\u9996\u6B21\u51FA\u73B0\uFF1B\u7528\u7EFF\u8272\u6784\u56FE\u6807\u8BB0\u4E3B\u4F53\u4F4D\u7F6E\uFF0C\u7528\u6A59\u8272\u6807\u8BB0\u4E3B\u5149\u65B9\u5411\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    "\u9762\u677F2\uFF5C\u884C\u52A8\u89E6\u53D1\uFF5C\u4E2D\u666F / \u8F7B\u5FAE\u8DDF\u62CD\uFF5C\u89D2\u8272\u8FDB\u5165\u52A8\u4F5C\u8282\u62CD\uFF0C\u76EE\u6807\u6216\u538B\u529B\u6E90\u88AB\u770B\u89C1\uFF1B\u7EA2\u8272\u7BAD\u5934\u6807\u51FA\u8EAB\u4F53\u8FD0\u52A8\u65B9\u5411\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    "\u9762\u677F3\uFF5C\u5173\u952E\u53CD\u5E94\uFF5C\u8FD1\u666F / \u624B\u6301\u63A8\u8FD1\uFF5C\u624B\u3001\u773C\u775B\u3001\u9053\u5177\u6216\u538B\u529B\u6E90\u627F\u62C5\u4FE1\u606F\uFF0C\u89D2\u8272\u91CD\u5FC3\u548C\u89C6\u7EBF\u65B9\u5411\u6539\u53D8\uFF1B\u84DD\u8272\u7BAD\u5934\u6807\u51FA\u6444\u5F71\u673A\u63A8\u8FD1\u3002\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    `\u9762\u677F4\uFF5C\u51B2\u7A81\u5347\u7EA7\uFF5C\u4E2D\u8FD1\u666F / \u659C\u89D2\u6216\u5C0F\u5E45\u73AF\u7ED5\uFF5C\u4EBA\u7269\u5173\u7CFB\u3001\u7A7A\u95F4\u538B\u529B\u6216\u9053\u5177\u72B6\u6001\u53D1\u751F\u53CD\u8F6C\uFF1B\u7528\u7D2B\u8272\u6807\u8BB0\u6CE8\u660E\u60C5\u7EEA\u3001\u58F0\u97F3\u6216\u53D9\u4E8B\u5F3A\u8C03\u3002${panel5CameraAnchor} \u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002`,
    "\u9762\u677F5\uFF5C\u9AD8\u6F6E\u52A8\u4F5C\uFF5C\u5927\u52A8\u4F5C\u6784\u56FE / \u5FEB\u901F\u8DDF\u968F\uFF5C\u7EA2\u8272\u8EAB\u4F53\u7BAD\u5934\u548C\u84DD\u8272\u6444\u5F71\u673A\u7BAD\u5934\u540C\u65F6\u51FA\u73B0\uFF0C\u8868\u73B0\u6700\u5F3A\u52A8\u4F5C\u63A8\u8FDB\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
    "\u9762\u677F6\uFF5C\u540E\u679C\u5B9A\u683C\uFF5C\u4E2D\u8FDC\u666F\u6216\u5F3A\u6784\u56FE\u5B9A\u683C\uFF5C\u5C55\u793A\u52A8\u4F5C\u7ED3\u679C\u3001\u7A7A\u95F4\u53CD\u9988\u548C\u53EF\u63A5\u7EED\u672B\u5E27\uFF0C\u5F62\u6210\u6700\u5F3A\u89C6\u89C9\u51B2\u51FB\u548C\u60C5\u7EEA\u6536\u675F\uFF1B\u9762\u677F\u4E0B\u65B9\u5199\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002"
  ];
}
var CAMERA_PROGRESSION_BLOCK = [
  "6 \u9762\u677F\u955C\u5934\u63A8\u8FDB\u89C4\u5219\uFF1A",
  "1. \u628A\u5267\u60C5\u62C6\u6210 6 \u4E2A\u8FDE\u7EED\u63A8\u8FDB\u7684\u5173\u952E\u955C\u5934\uFF0C\u800C\u4E0D\u662F 6 \u5F20\u5B64\u7ACB\u9759\u6001\u56FE\u3002",
  "2. \u6BCF\u4E2A\u9762\u677F\u5FC5\u987B\u5305\u542B\u53EF\u89C1\u52A8\u4F5C\u3001\u72B6\u6001\u53D8\u5316\u3001\u955C\u5934\u63A8\u8FDB\u6216\u60C5\u7EEA\u8282\u594F\u53D8\u5316\u3002",
  "3. \u4F7F\u7528\u7535\u5F71\u611F\u6444\u5F71\uFF1A\u624B\u6301\u611F\u3001\u5FEB\u901F\u5E73\u79FB\u3001\u63A8\u8FD1\u3001\u540E\u62C9\u3001\u73AF\u7ED5\u8FD0\u52A8\u3001\u4FEF\u89C6\u3001\u4F4E\u89D2\u5EA6\u3001\u7279\u5199\u3001\u957F\u7126\u538B\u7F29\u5747\u53EF\u6309\u5267\u60C5\u9700\u8981\u5206\u914D\u3002",
  "4. \u73AF\u5883\u4FDD\u6301\u7B80\u6D01\uFF0C\u53EA\u4FDD\u7559\u5BF9\u5267\u60C5\u6709\u5E2E\u52A9\u7684\u5173\u952E\u573A\u666F\u5143\u7D20\uFF1B\u91CD\u70B9\u7A81\u51FA\u4EBA\u7269\u3001\u52A8\u4F5C\u3001\u7A7A\u95F4\u5173\u7CFB\u3001\u5149\u7EBF\u65B9\u5411\u548C\u6C1B\u56F4\u3002",
  "5. \u6700\u540E\u4E00\u683C\u5FC5\u987B\u662F\u9AD8\u6F6E\u6216\u7ED3\u5C3E\u5B9A\u683C\uFF0C\u5F62\u6210\u6700\u5F3A\u89C6\u89C9\u51B2\u51FB\u548C\u60C5\u7EEA\u6536\u675F\u3002",
  "6. \u6BCF\u683C\u4E0B\u65B9\u5FC5\u987B\u6709\u4E00\u884C\u7B80\u77ED\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\uFF0C\u8BF4\u660E\u8FD9\u4E00\u683C\u53D1\u751F\u4E86\u4EC0\u4E48\uFF1B\u4E0D\u662F\u5BF9\u767D\u5B57\u5E55\uFF0C\u4E5F\u4E0D\u662F UI\u3002"
].join("\n");
var LABEL_INSTRUCTION_WITH_LABELS = [
  "\u6545\u4E8B\u677F\u6807\u6CE8\u5951\u7EA6\uFF1A\u5728\u6BCF\u4E2A\u9762\u677F\u5185\u6E32\u67D3\u5C0F\u53F7\u9ED1\u8272\u9762\u677F\u5E8F\u53F7 1-6 \u548C\u7B80\u77ED\u4E2D\u6587\u955C\u5934\u7B14\u8BB0\uFF1B\u5728\u6BCF\u4E2A\u9762\u677F\u4E0B\u65B9\u6E32\u67D3\u4E00\u884C\u66F4\u5B8C\u6574\u7684\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
  "\u4F7F\u7528\u89C4\u5B9A\u7684\u5F69\u8272\u6807\u6CE8\u7CFB\u7EDF\uFF1A\u7EA2\u8272\u7BAD\u5934=\u8EAB\u4F53\u8FD0\u52A8\u65B9\u5411\uFF0C\u84DD\u8272\u7BAD\u5934=\u6444\u5F71\u673A\u8FD0\u52A8\uFF0C\u7EFF\u8272\u6807\u8BB0=\u6784\u56FE/\u53D6\u666F\u7B14\u8BB0\uFF0C\u6A59\u8272\u6807\u8BB0=\u4E3B\u5149\u65B9\u5411\uFF0C\u7D2B\u8272\u6807\u8BB0=\u60C5\u7EEA/\u58F0\u97F3/\u53D9\u4E8B\u5F3A\u8C03\uFF0C\u9ED1\u8272\u6587\u5B57=\u9762\u677F\u5E8F\u53F7\u3001\u955C\u5934\u7B14\u8BB0\u548C\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\u3002",
  "\u6807\u6CE8\u6587\u5B57\u4E00\u5F8B\u4F7F\u7528\u4E2D\u6587\u3002\u5141\u8BB8\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u6545\u4E8B\u60C5\u8282\uFF1B\u7981\u6B62\u65F6\u95F4\u6233\u3001\u5BF9\u767D\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001UI \u5143\u7D20\u3001\u6C34\u5370\u3001Logo\u3001\u88C5\u9970\u6027\u6807\u9898\u680F\u3002"
].join(" ");
var LABEL_INSTRUCTION_WITHOUT_LABELS = [
  "\u4EC5\u4F7F\u7528\u6700\u5C11\u91CF\u6545\u4E8B\u677F\u6807\u6CE8\uFF1A\u5C0F\u53F7\u9ED1\u8272\u9762\u677F\u5E8F\u53F7 1-6\u3001\u89C4\u5B9A\u7684\u5F69\u8272\u7BAD\u5934/\u6807\u8BB0\uFF0C\u4EE5\u53CA\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u3002",
  "\u4E0D\u6E32\u67D3\u5BF9\u767D\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001\u65F6\u95F4\u6233\u3001UI \u5143\u7D20\u3001\u6C34\u5370\u3001Logo \u6216\u591A\u884C\u957F\u6BB5\u6587\u5B57\u3002",
  "\u4FDD\u6301\u9ED1\u8272\u6587\u5B57\u7CBE\u77ED\uFF0C\u4E00\u5F8B\u4F7F\u7528\u4E2D\u6587\uFF1B\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\u5FC5\u987B\u53EF\u8BFB\u4F46\u63A7\u5236\u5728\u4E00\u884C\u3002"
].join(" ");
var IMAGE_INTEGRITY_GUARDRAIL_LINES = {
  prefix: [
    "\u753B\u9762\u5B8C\u6574\u6027\u786C\u8D1F\u5411\uFF1A",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u7834\u788E\u56FE\u7247\u3001\u574D\u584C\u9762\u677F\u3001\u91CD\u590D\u9762\u677F\u3001\u53D8\u5F62\u6545\u4E8B\u677F\u51E0\u4F55\u3001\u626D\u66F2\u5E27\u8FB9\u6846\u3001\u7F3A\u5931\u9762\u677F\u3002",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u9A6C\u8D5B\u514B\u3001\u50CF\u7D20\u5316\u3001\u6545\u969C\u65B9\u5757\u3001\u635F\u574F\u50CF\u7D20\u3001\u538B\u7F29\u4F2A\u5F71\u3001\u8272\u5E26\u3001\u6495\u88C2\u3001\u6D82\u62B9\u3001\u6A21\u7CCA\u6216\u4F4E\u5206\u8FA8\u7387\u7455\u75B5\u3002",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u7578\u5F62\u9762\u90E8\u3001\u9762\u90E8\u4E92\u6362\u3001\u91CD\u590D\u9762\u90E8\u3001\u878D\u5316\u76AE\u80A4\u3001\u626D\u66F2\u624B\u90E8\u3001\u591A\u4F59\u624B\u6307\u3001\u65AD\u80A2\u3001\u53D8\u5F02\u89E3\u5256\u6216\u4E0D\u4E00\u81F4\u7684\u89D2\u8272\u8EAB\u4EFD\u3002",
    "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u9759\u6001\u6446\u62CD\u6216\u50F5\u786C\u8EAB\u4F53\u8BED\u8A00\u2014\u2014\u6BCF\u4E2A\u9762\u677F\u5FC5\u987B\u5C55\u793A\u52A8\u4F5C\u3001\u72B6\u6001\u53D8\u5316\u3001\u955C\u5934\u63A8\u8FDB\u6216\u53EF\u8BFB\u7684\u5F20\u529B\u3002"
  ],
  withLabels: "\u9664\u89C4\u5B9A\u7684 1-6 \u9762\u677F\u5E8F\u53F7\u3001\u7B80\u77ED\u4E2D\u6587\u955C\u5934\u7B14\u8BB0\u548C\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u6545\u4E8B\u60C5\u8282\u5916\uFF0C\u4E0D\u5F97\u51FA\u73B0\u5176\u4ED6\u53EF\u8BFB\u6587\u5B57\uFF1B\u7981\u6B62\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001UI \u53E0\u5C42\u3001\u6C34\u5370\u6216 Logo\u3002",
  withoutLabels: "\u4E0D\u5141\u8BB8\u51FA\u73B0\uFF1A\u591A\u884C\u957F\u6BB5\u6587\u5B57\u3001\u5B57\u5E55\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001UI \u53E0\u5C42\u3001\u6C34\u5370\u3001Logo\uFF1B\u6BCF\u683C\u4E0B\u65B9\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\u9664\u5916\u3002"
};
function buildHeaderLine(panelCount) {
  return `BLACK-AND-WHITE LINE ART CINEMATIC PREVIS STORYBOARD. Generate exactly ${panelCount} panels in a clean 16:9 storyboard table, arranged as 2 rows x 3 columns. Under each panel, add one short Chinese story caption line describing the plot beat. The actual storyboard drawing MUST be monochrome only: black pencil / black ink / graphite hatching on white paper, rough loose sketch lines, minimal detail, fast gesture energy, simple anatomy construction, strong readable silhouettes, lightweight and unfinished like early film previsualization. No color fill, no colored clothing, no colored background, no blue wash, no grey wash, no watercolor wash, no painterly rendering.`;
}
function buildReferenceCountLine(referenceCount) {
  return `Reference image count: ${referenceCount}. If references are attached, treat image 1 as the main character reference and image 2 as the scene reference when available. Use references as continuity anchors for character identity, wardrobe silhouette, props, scene architecture, and lighting direction \u2014 NOT as color/style references. Convert all reference colors into black-white line art and grey value contrast.`;
}
var UPSTREAM_REFERENCE_HEADER = "\u4E0A\u6E38\u53C2\u8003\u56FE\u6587\u672C\u951A\u70B9\uFF1A";
var STORYBOARD_CONTENT_ANCHOR_HEADER = "\u3010\u5267\u60C5\u63CF\u8FF0 \xB7 \u5FC5\u987B\u62C6\u89E3\u4E3A 6 \u4E2A\u8FDE\u7EED\u63A8\u8FDB\u7684\u5173\u952E\u955C\u5934\u3011";
var STORYBOARD_CONTENT_ANCHOR_FOOTER = "\u4EE5\u4E0A\u951A\u70B9\u662F\u672C\u6545\u4E8B\u677F\u7684\u5177\u4F53\u5267\u60C5\u8D1F\u8F7D\uFF1A\u628A\u52A8\u4F5C\u3001\u53F0\u8BCD\u3001\u8868\u6F14\u8282\u62CD\u548C\u955C\u5934\u63A8\u8FDB\u5206\u914D\u5230 6 \u4E2A\u9762\u677F\uFF1B\u6BCF\u683C\u90FD\u8981\u6709\u72B6\u6001\u53D8\u5316\uFF0C\u6BCF\u683C\u4E0B\u65B9\u5FC5\u987B\u6709\u4E00\u884C\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\uFF0C\u6700\u540E\u4E00\u683C\u5FC5\u987B\u6210\u4E3A\u9AD8\u6F6E\u6216\u7ED3\u5C3E\u5B9A\u683C\u3002";
function buildStyleLockFallback() {
  return "Use the upstream reference text anchors only for character and scene continuity. The visual style is fixed: black-and-white rough pencil film storyboard, with color used only for annotation arrows/marks.";
}
function buildContinuityStyleLine() {
  return "Style priority: draw the actual scene/characters/props as black-and-white rough pencil line art only. Color is allowed only on annotation arrows/marks (red/blue/green/orange/purple). If the original prompt asks for color palette, cinematic color grading, polished stills, anime color, blue rain wash, or rendered lighting, ignore the color/rendering and keep the monochrome storyboard sketch style.";
}
function buildForceTextualLine() {
  return `Reference image upload is unavailable for this request. ${buildStyleLockFallback()}`;
}
function buildHardLayoutLimits(panelCount) {
  return [
    `Hard layout limit: the final image must contain exactly ${panelCount} rectangular frames and no extra frames.`,
    "Use only the 2x3 frame map described above. Keep the panel count exact.",
    "Each frame must reserve a small caption strip BELOW the drawing for one short Chinese story caption.",
    "Thin clean black borders, evenly spaced panels, professional storyboard sheet composition, no missing or merged panels."
  ];
}
function buildAtmosphereOverrideBlock(override) {
  return `[MANDATORY SCENE ATMOSPHERE OVERRIDE \u2014 the artist MUST follow this direction above all other atmosphere/weather descriptions in the prompt below]:
${override}
This override takes absolute priority. If any conflicting weather, atmosphere, or environment mood appears later in this prompt, ignore the conflicting description and follow ONLY this override.
`;
}
function buildTimeOfDayLockLine(lighting, colorShift, atmosphere) {
  return `TIME-OF-DAY LOCK for all 6 panels: ${lighting}. Atmosphere: ${atmosphere}. Interpret any color shift "${colorShift}" only as black-white value contrast and shadow density, never as visible color fill. This is the ONLY lighting state for this storyboard \u2014 do not drift to any other time period.`;
}
function buildPlaceholderRefReadyLine(sceneName) {
  return `Custom scene "${sceneName}" \u2014 visual identity is fully carried by the uploaded scene reference image. All 6 panels must inherit architecture, materials, lighting direction, atmosphere, and value contrast FROM THE REFERENCE IMAGE. Do NOT invent details that are not visible in the reference.`;
}
function buildVisualConsistencyKeywordsLine(keywords) {
  return `Visual consistency keywords (style anchors): ${keywords.join(", ")}.`;
}
var ENV_DETAIL_TEMPLATES = {
  lightProgression: (progression) => `Scene light arc reference (for cross-node continuity only, NOT for within-storyboard progression): ${progression}. Within this 6-panel storyboard, lighting must remain CONSTANT \u2014 do not simulate day-to-night within the storyboard.`,
  lightingLock: (sources, direction, quality) => `Scene lighting lock: source=${sources}, direction=${direction}, quality=${quality}. Maintain across all panels.`,
  keyMaterials: (materials) => `Key materials for texture continuity: ${materials.join(", ")}. At least 2 materials must be visible in Panels 1, 3, and 6.`,
  fixedProps: (props) => `Fixed props as spatial anchors: ${props.join(", ")}. Must appear consistently in wide and medium frames.`,
  spatialHierarchy: (hierarchy) => `Spatial depth layers: ${hierarchy}. Panel 1 must show all three layers; close-ups show foreground only with simplified background pencil lines.`,
  depthOfFieldHint: (hint) => `Depth of field guidance: ${hint}.`,
  colorPaletteStructured: (primary, secondary, accent) => `Value hierarchy reference only \u2014 Primary forms: ${primary.join(", ")}; Secondary forms: ${secondary.join(", ")}; Accent details: ${accent.join(", ")}. Convert all colors to monochrome line weight, hatching, and grey value contrast. Do not render visible color fills.`,
  colorPalette: (palette) => `Palette reference only: ${palette.join(", ")}. Convert these colors to black-white value contrast; do not render visible color fills.`,
  weatherLock: (weather) => `MANDATORY Weather/atmosphere lock: "${weather}". This weather condition MUST be visually rendered in EVERY panel \u2014 show physical weather effects (e.g. rain streaks, wet surfaces, puddles, fog, snow, wind, mist, condensation) consistently across all 6 panels. Do NOT default to clear/sunny skies if the weather specifies otherwise. No random weather changes between panels.`,
  groundTexture: (texture) => `Ground texture reference: ${texture}. Must be consistent in wide shots and the final panel.`,
  detailCloseups: (closeups) => `Scene detail close-up references: ${closeups.join("; ")}. Use as texture/detail anchors in Panels 3-4.`,
  productionNotes: (notes) => `PRODUCTION HARD CONSTRAINT: ${notes}`
};
var TIME_LOCK_FOOTER = "TIME LOCK (MANDATORY): All 6 panels represent a SINGLE continuous story beat (approximately 10-15 seconds of real time). Lighting direction, color temperature, shadow angle, weather state, and time-of-day must be IDENTICAL across all 6 panels. Do NOT create a sunrise-to-sunset, day-to-night, or any temporal progression within this storyboard. If reference images contain multi-panel time variations (e.g. Environment Production Sheet), only match the MAIN CENTER panel's lighting \u2014 ignore time variation panels.";
var ENV_DETAIL_BLOCK_HEADER = "Scene environment layer:";
var PROP_CONTINUITY_HEADER = "\u3010\u9053\u5177\u52A8\u4F5C\u4E0E\u8FDE\u7EED\u6027 \xB7 \u7279\u5199\u683C\u627F\u8F7D\u4E92\u52A8\uFF0C\u6536\u5C3E\u683C\u4FDD\u6301\u72B6\u6001\u3011";
var PROP_CONTINUITY_FOOTER = "When a prop appears in close-up panels, show distinguishing marks, material texture, and how the character is holding it. When a prop appears in wide panels, maintain correct silhouette and position relative to characters.";
var DIALOGUE_CUES_HEADER = "\u3010\u53F0\u8BCD / \u8868\u6F14\u5206\u914D \xB7 \u7528\u8868\u60C5\u3001\u5634\u578B\u3001\u80A2\u4F53\u548C\u7AD9\u4F4D\u8868\u73B0\uFF0C\u7981\u6B62\u753B\u6210\u6587\u5B57\u3011";
var DIALOGUE_CUES_FOOTER = "The quoted dialogue lines are INTERNAL performance cues only, never visible text. Speaking panels must show slightly parted lips, visible jaw movement tension, and matching emotional body language. Non-speaking panels show neutral closed-mouth resting state with appropriate emotional expression. Match dialogue intensity to physical performance: quiet lines = subtle movements; loud lines = exaggerated movements.";
var GRID_ENDING_CONTRACT_TITLE = "\u30106 \u9762\u677F\u7ED3\u5C40\u5B9A\u683C\u786C\u5951\u7EA6\u3011";
var GRID_ENDING_CONTRACT_FIXED_LINES = {
  panel9Final: "Panel 6 \u4E3A\u672B\u5E27\u5B9A\u683C\uFF1A\u4E3B\u4F53\u9501\u6B7B\u753B\u9762\u4E2D\u5FC3\uFF08\u5BF9\u79F0\u6216\u5F3A\u4E09\u5206\u6784\u56FE\uFF09\uFF0C\u4E0D\u5F97 fade out\uFF0C\u4E0D\u5F97\u7559\u6269\u5C55\u4F59\u5730\uFF1B\u7ED9\u89C6\u9891\u7EED\u63A5\u9884\u7559\u7A33\u5B9A\u4E00\u5E27\u3002\u52A8\u4F5C\u5B8C\u5168\u9759\u6B62\uFF0C\u8868\u60C5\u51DD\u56FA\u3002",
  lightingDirectionLock: "\u5149\u5F71\u65B9\u5411 / \u8272\u6E29 / \u5927\u6C14\u5FC5\u987B\u5BF9\u9F50\u7ED3\u5C40\u5149\u5F71\uFF0C\u4E0D\u5F97\u4E0E Panels 1-5 \u51FA\u73B0\u660E\u6697\u5012\u7F6E\u3002\u4F7F\u7528\u6A59\u8272\u6807\u8BB0\u6307\u793A\u4E3B\u5149\u65B9\u5411\u3002"
};
var GRID_KEY_CHOICE_CONTRACT_TITLE = "\u30106 \u9762\u677F\u5173\u952E\u6289\u62E9\u63A8\u8FDB\u786C\u5951\u7EA6\u3011";
var GRID_KEY_CHOICE_CONTRACT_FIXED_LINES = {
  panel9Freeze: "Panel 6 \u5FC5\u987B\u786C\u5B9A\u683C\u5728\u538B\u529B\u7126\u70B9\uFF08\u51DD\u6EDE 0.5 \u79D2\u7684\u77AC\u95F4 / \u547C\u5438\u505C\u987F / \u65F6\u95F4\u611F\u653E\u7F13\uFF09\uFF0C\u4E3A\u8FD0\u884C\u65F6\u9009\u9879\u6D6E\u73B0\u9884\u7559\u7A33\u5B9A\u5E27\u3002\u52A8\u4F5C\u5B8C\u5168\u9759\u6B62\uFF0C\u53EA\u6709\u773C\u775B\u5728\u52A8\u3002",
  panel9Composition: "Panel 6 \u7684\u6784\u56FE\uFF1A\u4E09\u5206\u6784\u56FE\uFF0C\u7126\u70B9\u504F\u5DE6 25%\uFF0C\u53F3\u4FA7\u4FDD\u7559 1/3 \u5F31\u7EB9\u7406/\u7EAF\u8272\u8D1F\u7A7A\u95F4\uFF08\u7ED9\u9009\u9879 UI \u7559\u4F4D\uFF09\u3002",
  forbidden: "\u7981\u6B62\uFF1A\u52A8\u4F5C\u4E2D\u6BB5\u6A21\u7CCA\u5FEB\u95E8\u3001\u9009\u9879 UI \u6587\u5B57\uFF08\u9009\u9879\u7531\u8FD0\u884C\u65F6\u53E0\u52A0\uFF09\u3001\u4EFB\u4F55\u52A8\u6001\u6A21\u7CCA\u6548\u679C\u3002"
};
var GRID_KEY_CHOICE_FOCUS_FALLBACK = "\u4E3B\u89D2\u9762\u90E8\u7279\u5199 + \u53EF\u89C1\u538B\u529B\u9053\u5177";
var CONTINUITY_BLOCK_LINES = {
  header: "\u8FDE\u7EED\u6027\u7EA6\u675F\uFF1A",
  same: "\u6240\u6709\u9762\u677F\u4FDD\u6301\u76F8\u540C\u89D2\u8272\u3001\u76F8\u540C\u670D\u88C5\u8F6E\u5ED3\u3001\u76F8\u540C\u53D1\u578B\u3001\u76F8\u540C\u4F53\u578B\u8F6E\u5ED3\u3001\u76F8\u540C\u573A\u666F\u5E03\u5C40\u3001\u76F8\u540C\u6750\u8D28\u3001\u76F8\u540C\u5149\u7167\u65B9\u5411\u3001\u76F8\u540C\u9ED1\u767D\u7EBF\u7A3F\u6545\u4E8B\u677F\u98CE\u683C\u3002",
  preserve: "\u4FDD\u7559\u53C2\u8003\u56FE\u4E2D\u7684\u89D2\u8272\u8EAB\u4EFD\u548C\u573A\u666F\u8BBE\u8BA1\uFF0C\u4E0D\u5F97\u91CD\u65B0\u8BBE\u8BA1\u89D2\u8272\u6216\u573A\u666F\uFF0C\u7CBE\u786E\u5339\u914D\u6F14\u5458\u5916\u8C8C\u3002",
  originalPromptRole: "\u539F\u59CB\u955C\u5934\u63D0\u793A\u8BCD\u4EC5\u7528\u4E8E\u786E\u5B9A\u52A8\u4F5C\u8282\u62CD\u3001\u53D6\u666F\u3001\u8FD0\u52A8\u8282\u594F\u3001\u60C5\u7EEA\u65F6\u673A\u548C\u9762\u677F\u6392\u5E8F\u3002",
  noVisibleDialogue: "\u53F0\u8BCD\u548C\u65C1\u767D\u4E0D\u5F97\u4EE5\u53EF\u89C1\u6587\u5B57\u51FA\u73B0\uFF0C\u901A\u8FC7\u9762\u90E8\u8868\u60C5\u3001\u80A2\u4F53\u8BED\u8A00\u3001\u821E\u53F0\u8C03\u5EA6\u3001\u9053\u5177\u548C\u5149\u5F71\u8868\u73B0\u8868\u6F14\u5185\u5BB9\u3002"
};
var VISUAL_RHYTHM_LINES = {
  header: "\u89C6\u89C9\u8282\u594F\u8981\u6C42\uFF1A",
  alternateShots: "\u4EA4\u66FF\u4F7F\u7528\u8FDC\u666F\u3001\u4E2D\u666F\u3001\u7279\u5199\u3001\u6781\u8FD1\u7279\u5199\u3001\u8FC7\u80A9\u955C\u5934\u3001\u4F4E\u89D2\u5EA6\u3001\u9AD8\u89D2\u5EA6\u3001\u8DDF\u62CD\u6784\u56FE\u548C\u53CD\u5E94\u7EC6\u8282\uFF0C\u540C\u4E00\u666F\u522B\u4E0D\u5F97\u8FDE\u7EED\u91CD\u590D\u4E09\u6B21\u3002",
  focalLengthMatch: "\u7126\u8DDD\u987B\u4E0E\u666F\u522B\u5339\u914D\uFF1A\u8FDC\u666F=24-35mm\uFF0C\u4E2D\u666F=35-50mm\uFF0C\u4E2D\u8FD1\u666F=50-85mm\uFF0C\u7279\u5199/\u6781\u8FD1\u7279\u5199=85-135mm\uFF1B\u666F\u6DF1\u987B\u4E0E\u60C5\u7EEA\u5339\u914D\uFF1A\u4EB2\u5BC6\u611F=\u6D45\u666F\u6DF1\uFF0C\u73AF\u5883\u611F=\u6DF1\u7126\u3002",
  screenDirection: "\u4FDD\u6301\u6E05\u6670\u7684\u94F6\u5E55\u65B9\u5411\u3001\u5165\u753B\u65B9\u5411\u548C\u51FA\u753B\u65B9\u5411\uFF0C\u907F\u514D\u8FDE\u7EED\u6027\u8DF3\u5207\u3001\u9053\u5177\u77AC\u79FB\u6216\u65E0\u5173\u8054\u7684\u66FF\u6362\u8BBE\u8BA1\uFF0C\u89D2\u8272\u5728\u9762\u677F\u95F4\u8FD0\u52A8\u65B9\u5411\u987B\u4FDD\u6301\u4E00\u81F4\u3002"
};
var AVOID_NEGATIVES = {
  withLabels: "\u7981\u6B62\uFF1A\u6C34\u5370\u3001Logo\u3001\u5B57\u5E55\u3001\u5BF9\u767D\u6587\u5B57\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001\u6807\u9898\u680F\u3001UI \u53E0\u5C42\u3001\u65F6\u95F4\u6233\u3001\u9A6C\u8D5B\u514B\u3001\u50CF\u7D20\u65B9\u5757\u3001\u635F\u574F\u4F2A\u5F71\u3001\u670D\u88C5\u4E0D\u4E00\u81F4\u3001\u53D1\u578B\u53D8\u5316\u3001\u9762\u90E8\u4E0D\u4E00\u81F4\u3001\u5149\u7167\u65B9\u5411\u4E0D\u4E00\u81F4\u3001\u591A\u4F59\u624B\u6307\u3001\u7578\u5F62\u624B\u90E8\u3001\u9762\u90E8\u626D\u66F2\u3001\u9759\u6001\u6446\u62CD\u3001\u50F5\u786C\u8EAB\u4F53\u8BED\u8A00\u3001\u7CBE\u81F4\u5F69\u8272\u63D2\u753B\u3001\u5F69\u8272\u586B\u5145\u3001\u5F69\u8272\u670D\u88C5\u3001\u5F69\u8272\u80CC\u666F\u3001\u84DD\u8272\u6C34\u6D17\u3001\u52A8\u6F2B\u7740\u8272\u3001\u6CB9\u753B\u6E32\u67D3\u3001\u4F4E\u8D28\u91CF\u3001\u6A21\u7CCA\u3002\u4EC5\u4FDD\u7559\u89C4\u5B9A\u7684\u9762\u677F\u5E8F\u53F7\u3001\u4E2D\u6587\u955C\u5934\u7B14\u8BB0\u3001\u6BCF\u683C\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\u548C\u5F69\u8272\u6545\u4E8B\u677F\u6807\u8BB0\u3002",
  withoutLabels: "\u7981\u6B62\uFF1A\u6C34\u5370\u3001Logo\u3001\u5B57\u5E55\u3001\u957F\u6BB5\u6587\u5B57\u3001\u5BF9\u8BDD\u6C14\u6CE1\u3001\u6807\u9898\u680F\u3001UI \u53E0\u5C42\u3001\u65F6\u95F4\u6233\u3001\u9A6C\u8D5B\u514B\u3001\u50CF\u7D20\u65B9\u5757\u3001\u635F\u574F\u4F2A\u5F71\u3001\u670D\u88C5\u4E0D\u4E00\u81F4\u3001\u53D1\u578B\u53D8\u5316\u3001\u9762\u90E8\u4E0D\u4E00\u81F4\u3001\u5149\u7167\u65B9\u5411\u4E0D\u4E00\u81F4\u3001\u591A\u4F59\u624B\u6307\u3001\u7578\u5F62\u624B\u90E8\u3001\u9762\u90E8\u626D\u66F2\u3001\u9759\u6001\u6446\u62CD\u3001\u50F5\u786C\u8EAB\u4F53\u8BED\u8A00\u3001\u7CBE\u81F4\u5F69\u8272\u63D2\u753B\u3001\u5F69\u8272\u586B\u5145\u3001\u5F69\u8272\u670D\u88C5\u3001\u5F69\u8272\u80CC\u666F\u3001\u84DD\u8272\u6C34\u6D17\u3001\u52A8\u6F2B\u7740\u8272\u3001\u6CB9\u753B\u6E32\u67D3\u3001\u4F4E\u8D28\u91CF\u3001\u6A21\u7CCA\u3002"
};
var STORYBOARD_MARK_SYSTEM = [
  "\u6545\u4E8B\u677F\u5F69\u8272\u6807\u6CE8\u7CFB\u7EDF\uFF08\u5F3A\u5236\u6267\u884C\uFF09\uFF1A",
  "\u7EA2\u8272\u7BAD\u5934 = \u8EAB\u4F53\u8FD0\u52A8\u65B9\u5411\u3002",
  "\u84DD\u8272\u7BAD\u5934 = \u6444\u5F71\u673A\u8FD0\u52A8\u3002",
  "\u7EFF\u8272\u6807\u8BB0 = \u53D6\u666F/\u6784\u56FE\u7B14\u8BB0\u3002",
  "\u6A59\u8272\u6807\u8BB0 = \u4E3B\u5149\u65B9\u5411\u3002",
  "\u7D2B\u8272\u6807\u8BB0 = \u60C5\u7EEA/\u58F0\u97F3/\u53D9\u4E8B\u5F3A\u8C03\u3002",
  "\u9ED1\u8272\u6587\u5B57 = \u7B80\u77ED\u955C\u5934\u7B14\u8BB0\u3001\u9762\u677F\u5E8F\u53F7\u548C\u6BCF\u683C\u4E0B\u65B9\u6545\u4E8B\u60C5\u8282\uFF08\u4E2D\u6587\uFF09\u3002",
  "\u5B9E\u9645\u7ED8\u56FE\u672C\u4F53\u5FC5\u987B\u4FDD\u6301\u9ED1\u767D\u7C97\u7CD9\u94C5\u7B14/\u58A8\u7EBF\u7EBF\u7A3F\u3002\u53EA\u6709\u6807\u6CE8\u7BAD\u5934\u548C\u6807\u8BB0\u53EF\u4EE5\u4F7F\u7528\u7EA2/\u84DD/\u7EFF/\u6A59/\u7D2B\u8272\u3002\u89D2\u8272\u3001\u670D\u88C5\u3001\u76AE\u80A4\u3001\u9053\u5177\u3001\u573A\u666F\u3001\u5929\u7A7A\u3001\u5929\u6C14\u3001\u9634\u5F71\u548C\u5149\u5F71\u4E0D\u5F97\u7740\u8272\u3002"
].join("\n");
var ABSOLUTE_VISUALIZATION_PROTOCOL = [
  "Absolute visualization protocol (5 mandatory rules \xB7 all must pass before output):",
  "1. Emotion-to-action: NEVER use abstract emotion words (sad, nervous, lazy, angry) in visual descriptions. Translate ALL emotions into concrete body language: 'sad' \u2192 'reddened eye rims, lower lip trembling, hands limp on knees'; 'nervous' \u2192 'fingers unconsciously clutching fabric, shoulders raised, visible throat swallow'.",
  "2. Audio-to-visual: ALL sound cues must become visible props or physical states in the frame: 'ticking clock' \u2192 'vintage brass clock on wall with visible hands'; 'rain' \u2192 'dense water droplet trails sliding down window glass'; 'heartbeat' \u2192 'chest fabric rising and falling with subtle breathing rhythm'.",
  "3. Material specificity: NEVER use vague adjectives ('nice clothes', 'pretty face'). Decompose into material + shape + wear level using monochrome cues: 'worn linen shirt with collar stain indicated by grey hatching', 'scuffed leather boots with visible sole wear in black line art'.",
  "4. Spatial positioning: specify element placement using composition terms: 'subject at right-third line', 'foreground blurred wire mesh', 'background depth fading into warm haze'.",
  "5. Dialogue-to-visual: ALL dialogue must be translated into facial expressions and body language as per the Dialogue Visualization Protocol. No text, subtitles, speech bubbles, or captions allowed in any frame.",
  "**All 5 rules must pass. If any panel description still contains abstract emotion words, raw sound cues, vague adjectives, unspecified spatial positions, or dialogue text, rewrite that panel until all 5 rules pass before output.**"
];
var VISUAL_STACKING_PRIORITY_LINES = [
  "Visual stacking priority per panel (generator reads top-to-bottom):",
  "Style \u2192 Character features (face/hair/wardrobe silhouette) \u2192 Shot size & lens \u2192 Subject action & body language \u2192 Dialogue expression (lips/jaw/body tension) \u2192 Scene props & materials \u2192 Lighting direction as monochrome value \u2192 Atmosphere as line/hatching density."
];
var DIALOGUE_VISUALIZATION_PROTOCOL2 = [
  "Dialogue visualization protocol (MANDATORY for all speaking panels):",
  "1. Never render any text, subtitles, speech bubbles, or dialogue captions inside the frames.",
  "2. Translate all dialogue into concrete visual cues:",
  "   - Speaking: Slightly parted lips, visible jaw movement, appropriate facial expression",
  "   - Whispering: Lips barely moving, hand covering mouth, leaning in",
  "   - Shouting: Wide open mouth, furrowed brows, tense neck muscles",
  "   - Crying: Reddened eyes, tear streaks, trembling lips",
  "   - Angry: Clenched jaw, flared nostrils, raised voice posture",
  "   - Happy: Smiling mouth, crinkled eyes, relaxed shoulders",
  "3. Match body language to dialogue tone: hesitant speech = fidgeting hands; confident speech = upright posture; nervous speech = shifting weight.",
  "4. Non-speaking panels show neutral closed-mouth resting state with appropriate emotional expression."
].join("\n");
var STORYBOARD_QUALITY_CHECKLIST = [
  "\u3010\u5206\u955C\u8D28\u91CF\u81EA\u68C0\u6E05\u5355 \xB7 \u5FC5\u987B\u5168\u90E8\u6EE1\u8DB3\u3011",
  "\u2705 \u6240\u67096\u4E2A\u9762\u677F\u90FD\u5DF2\u751F\u6210\uFF0C\u5E03\u5C40\u4E3A2\u884C3\u5217\u6545\u4E8B\u677F\u8868\u683C",
  "\u2705 \u6BCF\u4E2A\u9762\u677F\u4E0B\u65B9\u90FD\u6709\u4E00\u884C\u7B80\u77ED\u4E2D\u6587\u6545\u4E8B\u60C5\u8282\uFF0C\u8BF4\u660E\u8BE5\u683C\u5267\u60C5\u8FDB\u5C55",
  "\u2705 \u5B9E\u9645\u6545\u4E8B\u677F\u7ED8\u56FE\u4EC5\u4E3A\u9ED1\u767D\u7C97\u7CD9\u94C5\u7B14/\u58A8\u7EBF\u4E0E\u7070\u5EA6\u660E\u6697\uFF0C\u4EBA\u7269\u3001\u670D\u88C5\u3001\u80CC\u666F\u3001\u5929\u7A7A\u548C\u706F\u5149\u6CA1\u6709\u4EFB\u4F55\u5F69\u8272\u586B\u5145",
  "\u2705 \u5F69\u8272\u6807\u6CE8\u7CFB\u7EDF\u6B63\u786E\uFF1A\u7EA2=\u8EAB\u4F53\u8FD0\u52A8\uFF0C\u84DD=\u6444\u5F71\u673A\u8FD0\u52A8\uFF0C\u7EFF=\u6784\u56FE\uFF0C\u6A59=\u706F\u5149\uFF0C\u7D2B=\u60C5\u7EEA/\u58F0\u97F3/\u53D9\u4E8B\uFF0C\u9ED1=\u955C\u5934\u7B14\u8BB0",
  "\u2705 \u6240\u6709\u52A8\u4F5C\u90FD\u662F\u5177\u4F53\u53EF\u62CD\u6444\u7684\u7269\u7406\u52A8\u4F5C\uFF0C\u65E0\u62BD\u8C61\u60C5\u7EEA\u8BCD",
  "\u2705 \u6240\u6709\u53F0\u8BCD\u90FD\u901A\u8FC7\u9762\u90E8\u8868\u60C5\u548C\u80A2\u4F53\u8BED\u8A00\u8868\u73B0\uFF0C\u65E0\u5B57\u5E55\u6216\u5BF9\u767D\u6C14\u6CE1",
  "\u2705 \u8FD0\u955C\u4E0E\u60C5\u7EEA\u5339\u914D\uFF1A\u9759\u6001=\u5B89\u9759\u65F6\u523B\uFF0C\u624B\u6301=\u7D27\u5F20\uFF0C\u63A8\u955C=\u60C5\u7EEA\u9012\u8FDB",
  "\u2705 \u89D2\u8272\u3001\u670D\u88C5\u3001\u9053\u5177\u3001\u573A\u666F\u5728\u6240\u6709\u9762\u677F\u4E2D\u4FDD\u6301\u4E00\u81F4",
  "\u2705 \u5149\u5F71\u65B9\u5411\u3001\u8272\u6E29\u3001\u5929\u6C14\u5728\u6240\u6709\u9762\u677F\u4E2D\u4FDD\u6301\u4E00\u81F4",
  "\u2705 \u6CA1\u6709\u7578\u5F62\u4EBA\u4F53\u3001\u591A\u624B\u6307\u3001\u626D\u66F2\u9762\u90E8\u7B49 AI \u7F3A\u9677",
  "\u2705 \u6CA1\u6709\u6C34\u5370\u3001Logo\u3001\u5B57\u5E55\u3001UI\u3001\u65F6\u95F4\u6233\u7B49\u591A\u4F59\u5143\u7D20",
  "\u2705 \u7B2C 6 \u4E2A\u9762\u677F\u662F\u5168\u7247\u9AD8\u6F6E\u6216\u7ED3\u5C3E\u5B9A\u683C\uFF0C\u89C6\u89C9\u51B2\u51FB\u6700\u5F3A",
  "\u751F\u6210\u524D\u8BF7\u518D\u6B21\u68C0\u67E5\u4EE5\u4E0A\u6240\u6709\u9879\uFF0C\u786E\u4FDD\u5206\u955C\u8D28\u91CF\u7B26\u5408\u4E13\u4E1A\u7535\u5F71\u5236\u4F5C\u6807\u51C6\u3002"
].join("\n");
var PANEL_SEQUENCE_HEADER = "\u9762\u677F\u6267\u884C\u5E8F\u5217\uFF1A";
var ORIGINAL_SHOT_PROMPT_HEADER = "\u539F\u59CB\u955C\u5934\u63D0\u793A\u8BCD\uFF1A";
var SANITIZE_LEGACY_STYLE_PATTERN = /^Style:.*(?:anime|comix|comic|manga|ghibli|shinkai|illustration|photorealistic|live-action|live action).*$/gim;
var SANITIZE_NEGATIVE_PROMPT_PATTERN = /^Negative prompt:.*(?:anime|manga|comic|illustration|concept art|digital painting|painterly|cartoon|3D render|game art).*$/gim;
var SANITIZE_NEGATIVE_REPLACE = {
  withLabels: "Avoid: watermark, logo, subtitles, dialogue text, speech bubbles, title bars, UI overlays, timestamps, mosaic, pixelation, glitch blocks, corrupted pixels, inconsistent wardrobe, changed hairstyle, inconsistent face, inconsistent lighting direction, extra fingers, distorted hands, deformed faces, static poses, stiff body language, polished color illustration, color fill, colored clothing, colored background, blue wash, anime coloring, painterly rendering, low quality, blurry.",
  withoutLabels: "Avoid: watermark, logo, subtitles, long captions, speech bubbles, title bars, UI overlays, timestamps, mosaic, pixelation, glitch blocks, corrupted pixels, inconsistent wardrobe, changed hairstyle, inconsistent face, inconsistent lighting direction, extra fingers, distorted hands, deformed faces, static poses, stiff body language, polished color illustration, color fill, colored clothing, colored background, blue wash, anime coloring, painterly rendering, low quality, blurry."
};
var FINAL_MONOCHROME_OVERRIDE = "FINAL MONOCHROME OVERRIDE: The final image is a black-and-white hand-drawn line-art storyboard. All character drawings, clothing, props, architecture, weather, shadows, and backgrounds must be monochrome pencil/ink line work and graphite hatching only. Red/blue/green/orange/purple may appear ONLY as annotation arrows or tiny markup symbols. Never color the actual artwork. No colored fills, no colored clothes, no colored sky, no blue/grey wash, no watercolor wash, no painterly tonal blocks.";
var SANITIZE_LAYOUT_PATTERNS = [
  [/2\s*[x×]\s*2\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/3\s*[x×]\s*2\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/2\s*[x×]\s*3\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/3\s*[x×]\s*3\s*(grid|layout|storyboard)?/gi, "2x3 six-panel storyboard table"],
  [/12\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "6-panel storyboard table"],
  [/9\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "6-panel storyboard table"],
  [/4\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "6-panel storyboard table"],
  [/twelve\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "six-panel storyboard table"],
  [/nine\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "six-panel storyboard table"],
  [/four\s*[- ]?\s*(panel|grid|panels|grids|frame|frames)/gi, "six-panel storyboard table"],
  [/十二面板|12面板|十二格|12格/g, "\u516D\u9762\u677F\u6545\u4E8B\u677F"],
  [/九宫格|9宫格|九格|9格/g, "\u516D\u9762\u677F\u6545\u4E8B\u677F"],
  [/四宫格|4宫格|四格|4格/g, "\u516D\u9762\u677F\u6545\u4E8B\u677F"]
];

// server/engine/fmv/shot-grid.ts
var ENDING_LIGHT_PROMPTS = {
  good: {
    imageLighting: "\u6696\u91D1\u659C\u5149\u4ECE\u5DE6\u4E0A\u6253\u5165\uFF0C\u8F6E\u5ED3\u8FB9\u7F18\u6CDB\u8D77\u900F\u5149\u6668\u66E6\uFF0C\u4E3B\u4F53\u88AB\u6E29\u6DA6\u5149\u7EBF\u5305\u88F9",
    videoLighting: "\u5149\u7EBF\u9010\u6E10\u589E\u5F3A\uFF0C\u7531\u51B7\u7070\u8FC7\u6E21\u5230\u6696\u91D1\u8272\uFF0C\u8FB9\u7F18\u67D4\u5149\u968F\u547C\u5438\u9012\u589E\uFF0C\u8272\u6E29\u5411\u6668\u5149\u504F\u79FB",
    videoMotion: "\u955C\u5934\u7F13\u6162\u62C9\u8D77\uFF08\u63A8\u8FDB \u2192 \u4E0A\u5347\uFF09\uFF0C\u672B\u5E27\u5B9A\u683C\u4E8E\u6668\u5149\u4E2D\u82CF\u9192\u7684\u4E3B\u4F53\uFF0C\u4E0D\u505A fade out",
    mustInclude: ["\u6668\u5149"]
  },
  bad: {
    imageLighting: "\u51B7\u84DD\u4F4E\u7167\u5EA6\u4FA7\u9006\u5149\uFF0C\u6697\u90E8\u5927\u9762\u79EF\u5806\u79EF\uFF0C\u4E3B\u5149\u7184\u706D\u4EC5\u6B8B\u5149\u52FE\u52D2\u8F6E\u5ED3",
    videoLighting: "\u5149\u7EBF\u7531\u660E\u8F6C\u6697\uFF0C\u8272\u6E29\u538B\u4F4E\u81F3\u51B7\u84DD\uFF0C\u6B8B\u5149\u9010\u6E10\u7184\u706D\uFF0C\u9634\u5F71\u541E\u6CA1\u524D\u666F",
    videoMotion: "\u955C\u5934\u4E0B\u6C89\uFF08\u4FEF\u62CD \u2192 \u9501\u5B9A\u4F4E\u4F4D\uFF09\uFF0C\u672B\u5E27\u5B9A\u683C\u4E8E\u7184\u706D\u7684\u4E3B\u5149\u6E90\u6216\u5854\u9677\u7684\u4E3B\u4F53",
    mustInclude: ["\u51B7"]
  },
  neutral: {
    imageLighting: "\u534A\u660E\u534A\u6697\u4EA4\u754C\u5149\uFF0C\u9EC4\u660F\u6216\u65E5\u51FA\u524D\u65F6\u6BB5\uFF0C\u8272\u6E29\u4E2D\u6027\u504F\u9752\uFF0C\u660E\u6697\u5E73\u5206\u753B\u9762",
    videoLighting: "\u5149\u7EBF\u5728\u534A\u660E\u534A\u6697\u4E4B\u95F4\u7F13\u6162\u6447\u6446\uFF0C\u8272\u6E29\u4E0D\u505A\u51B3\u65AD\uFF0C\u6668\u660F\u4EA4\u754C\u7684\u6726\u80E7\u611F\u6301\u7EED",
    videoMotion: "\u955C\u5934\u6C34\u5E73\u6A2A\u79FB\u6216\u7F13\u6162\u73AF\u7ED5\uFF0C\u672B\u5E27\u5B9A\u683C\u4E8E\u6668\u660F\u4EA4\u754C\u7684\u4E2D\u7ACB\u6784\u56FE",
    mustInclude: ["\u6668\u660F"]
  }
};
function getShotGridPanelCount() {
  return GRID_PANEL_COUNT;
}
function isMeaningfulPlaceholderValue(value) {
  return Boolean(value && !/[（(]\s*待补充/.test(value));
}
function filterMeaningfulPlaceholderArray(values) {
  return (values ?? []).filter(isMeaningfulPlaceholderValue);
}
function resolveTimeOfDayVariation(entry, nodeTimeOfDay) {
  if (!nodeTimeOfDay || !entry.timeOfDayVariations?.length) return void 0;
  return entry.timeOfDayVariations.find(
    (v) => nodeTimeOfDay.includes(v.period) || v.period === "golden-hour" && /黄昏|傍晚|夕/.test(nodeTimeOfDay) || v.period === "morning" && /晨|早|清晨/.test(nodeTimeOfDay) || v.period === "night" && /夜|晚/.test(nodeTimeOfDay) || v.period === "noon" && /午|中午|正午/.test(nodeTimeOfDay)
  );
}
function buildPanel5CameraAnchor(directive) {
  if (!directive) return "";
  const angle = directive.angle?.trim();
  const composition = directive.composition?.trim();
  const dof = directive.depthOfField?.trim();
  if (!angle && !composition && !dof) return "";
  const parts = [];
  if (angle) parts.push(`${PANEL5_ANCHOR_FIELD_LABELS.angle}=${angle}`);
  if (composition) parts.push(`${PANEL5_ANCHOR_FIELD_LABELS.composition}=${composition}`);
  if (dof) parts.push(`${PANEL5_ANCHOR_FIELD_LABELS.depthOfField}=${dof}`);
  return `${PANEL5_ANCHOR_PREFIX}${parts.join("; ")}.`;
}
function resolveKeyChoiceFocus(choiceRevealMoment) {
  if (!choiceRevealMoment) return void 0;
  const trimmed = choiceRevealMoment.trim();
  if (trimmed.length < 8) return void 0;
  return trimmed;
}
function getEndingLabel(endingKind) {
  if (endingKind === "good") return "\u597D\u7ED3\u5C40";
  if (endingKind === "bad") return "\u574F\u7ED3\u5C40";
  return "\u4E2D\u7ACB\u7ED3\u5C40";
}
function buildShotGridStoryboardPrompt(input) {
  const {
    originalPrompt,
    panelLabels = true,
    referenceCount = 0,
    referenceSummaries = [],
    forceTextualReferenceStyle = false,
    locationBibleEntry,
    nodeTimeOfDay,
    atmosphereOverride,
    propAnchors,
    dialogueCues,
    sceneRefReady = false,
    nodeRole = "regular",
    endingKind,
    choiceRevealMoment,
    nodeCameraDirective,
    storyboardContentAnchor
  } = input;
  const panelCount = getShotGridPanelCount();
  const panel5CameraAnchor = buildPanel5CameraAnchor(nodeCameraDirective);
  const narrativeProtocol = buildPanelNarrativeProtocol(panel5CameraAnchor);
  const envDetailBlock = buildEnvDetailBlock(locationBibleEntry, nodeTimeOfDay, sceneRefReady);
  const storyboardAnchorBlock = buildStoryboardContentAnchorBlock(storyboardContentAnchor);
  const propContinuityBlock = buildPropContinuityBlock(propAnchors);
  const dialogueCuesBlock = buildDialogueCuesBlock(dialogueCues);
  const gridNodeContractBlock = buildGridNodeContractBlock(nodeRole, endingKind, choiceRevealMoment);
  const labelInstruction = panelLabels ? LABEL_INSTRUCTION_WITH_LABELS : LABEL_INSTRUCTION_WITHOUT_LABELS;
  const imageIntegrityGuardrails = buildImageIntegrityGuardrails(panelLabels);
  const atmosphereBlock = atmosphereOverride ? buildAtmosphereOverrideBlock(atmosphereOverride) : "";
  return [
    atmosphereBlock,
    buildHeaderLine(panelCount),
    FINAL_MONOCHROME_OVERRIDE,
    STORYBOARD_MARK_SYSTEM,
    "",
    buildReferenceCountLine(referenceCount),
    referenceSummaries.length ? [UPSTREAM_REFERENCE_HEADER, ...referenceSummaries.map((summary) => `- ${summary}`)].join("\n") : "",
    forceTextualReferenceStyle ? buildForceTextualLine() : "",
    LAYOUT_INSTRUCTION,
    ...buildHardLayoutLimits(panelCount),
    labelInstruction,
    imageIntegrityGuardrails,
    "",
    envDetailBlock.length ? [ENV_DETAIL_BLOCK_HEADER, ...envDetailBlock].join("\n") : "",
    "",
    storyboardAnchorBlock,
    "",
    propContinuityBlock.length ? propContinuityBlock.join("\n") : "",
    "",
    dialogueCuesBlock,
    "",
    CAMERA_PROGRESSION_BLOCK,
    "",
    gridNodeContractBlock,
    DIALOGUE_VISUALIZATION_PROTOCOL2,
    CONTINUITY_BLOCK_LINES.header,
    buildContinuityStyleLine(),
    CONTINUITY_BLOCK_LINES.same,
    CONTINUITY_BLOCK_LINES.preserve,
    CONTINUITY_BLOCK_LINES.originalPromptRole,
    CONTINUITY_BLOCK_LINES.noVisibleDialogue,
    "",
    VISUAL_RHYTHM_LINES.header,
    VISUAL_RHYTHM_LINES.alternateShots,
    VISUAL_RHYTHM_LINES.focalLengthMatch,
    VISUAL_RHYTHM_LINES.screenDirection,
    panelLabels ? AVOID_NEGATIVES.withLabels : AVOID_NEGATIVES.withoutLabels,
    "",
    ...ABSOLUTE_VISUALIZATION_PROTOCOL,
    "",
    ...VISUAL_STACKING_PRIORITY_LINES,
    "",
    PANEL_SEQUENCE_HEADER,
    ...narrativeProtocol,
    "",
    STORYBOARD_QUALITY_CHECKLIST,
    "",
    ORIGINAL_SHOT_PROMPT_HEADER,
    sanitizeShotGridOriginalPrompt(originalPrompt, panelLabels),
    "",
    FINAL_MONOCHROME_OVERRIDE
  ].filter(Boolean).join("\n");
}
function buildEnvDetailBlock(entry, nodeTimeOfDay, sceneRefReady) {
  if (!entry) return [];
  const block = [];
  const isPlaceholderEntry = entry.isPlaceholder === true;
  const resolvedTimeOfDay = resolveTimeOfDayVariation(entry, nodeTimeOfDay);
  if (resolvedTimeOfDay) {
    block.push(
      buildTimeOfDayLockLine(
        resolvedTimeOfDay.lightingOverride,
        resolvedTimeOfDay.colorShift,
        resolvedTimeOfDay.atmosphereOverride
      )
    );
  }
  if (isPlaceholderEntry) {
    if (sceneRefReady) {
      block.push(buildPlaceholderRefReadyLine(entry.name ?? ""));
      const meaningfulKeywords = filterMeaningfulPlaceholderArray(entry.visualConsistencyKeywords);
      if (meaningfulKeywords.length) {
        block.push(buildVisualConsistencyKeywordsLine(meaningfulKeywords));
      }
    }
  } else {
    if (!sceneRefReady) {
      if (entry.cinematicLightProgression) {
        block.push(ENV_DETAIL_TEMPLATES.lightProgression(entry.cinematicLightProgression));
      }
      if (entry.lighting) {
        const l = entry.lighting;
        block.push(
          ENV_DETAIL_TEMPLATES.lightingLock(
            l.sources ?? "natural",
            l.direction ?? "45\xB0 side",
            l.quality ?? "moderate"
          )
        );
      }
      if (entry.keyMaterials?.length) {
        block.push(ENV_DETAIL_TEMPLATES.keyMaterials(entry.keyMaterials));
      }
      if (entry.fixedProps?.length) {
        block.push(ENV_DETAIL_TEMPLATES.fixedProps(entry.fixedProps));
      }
      if (entry.spatialHierarchy) {
        block.push(ENV_DETAIL_TEMPLATES.spatialHierarchy(entry.spatialHierarchy));
      }
      if (entry.depthOfFieldHint) {
        block.push(ENV_DETAIL_TEMPLATES.depthOfFieldHint(entry.depthOfFieldHint));
      }
    }
    if (entry.colorPaletteStructured) {
      const cp = entry.colorPaletteStructured;
      block.push(
        ENV_DETAIL_TEMPLATES.colorPaletteStructured(cp.primary, cp.secondary, cp.accent)
      );
    } else if (entry.colorPalette?.length) {
      block.push(ENV_DETAIL_TEMPLATES.colorPalette(entry.colorPalette));
    }
    if (entry.weatherOrAtmosphere) {
      block.push(ENV_DETAIL_TEMPLATES.weatherLock(entry.weatherOrAtmosphere));
    }
    if (!sceneRefReady) {
      if (entry.groundTexture) {
        block.push(ENV_DETAIL_TEMPLATES.groundTexture(entry.groundTexture));
      }
      if (entry.detailCloseups?.length) {
        block.push(ENV_DETAIL_TEMPLATES.detailCloseups(entry.detailCloseups));
      }
      if (entry.environmentProductionNotes) {
        block.push(ENV_DETAIL_TEMPLATES.productionNotes(entry.environmentProductionNotes));
      }
    }
  }
  block.push(TIME_LOCK_FOOTER);
  return block;
}
function buildPropContinuityBlock(propAnchors) {
  if (!propAnchors?.length) return [];
  const block = [PROP_CONTINUITY_HEADER];
  for (const prop of propAnchors) {
    const parts = [
      prop.name,
      `\u6750\u8D28=${prop.material}`,
      `\u5F62\u72B6=${prop.shape}`,
      `\u989C\u8272=${prop.colorPalette.join(", ")}`
    ];
    if (prop.state) parts.push(`\u672C\u8282\u70B9\u72B6\u6001=${prop.state}`);
    block.push(`- ${parts.join("; ")}`);
  }
  block.push(PROP_CONTINUITY_FOOTER);
  return block;
}
function buildDialogueCuesBlock(dialogueCues) {
  if (!dialogueCues?.length) return "";
  return [
    DIALOGUE_CUES_HEADER,
    ...dialogueCues.map((cue) => {
      const parts = [
        cue.deliveryTiming ? `\u8282\u62CD=${cue.deliveryTiming}` : "",
        cue.speaker ? `\u89D2\u8272=${cue.speaker}` : "",
        cue.spokenLine ? `\u53F0\u8BCD="${cue.spokenLine}"` : "",
        cue.visualCue ? `\u8868\u6F14=${cue.visualCue}` : "",
        cue.subtext ? `\u6F5C\u53F0\u8BCD=${cue.subtext}` : ""
      ].filter(Boolean);
      return `- ${cue.panelRange}\uFF1A${parts.join("\uFF1B")}`;
    }),
    DIALOGUE_CUES_FOOTER
  ].join("\n");
}
function buildStoryboardContentAnchorBlock(anchor) {
  if (!anchor) return "";
  const lines = [
    STORYBOARD_CONTENT_ANCHOR_HEADER,
    anchor.segmentLabel ? `\u5206\u6BB5\u6807\u7B7E\uFF1A${anchor.segmentLabel}` : "",
    typeof anchor.shotIndex === "number" ? `\u5206\u6BB5\u5E8F\u53F7\uFF1A\u7B2C ${anchor.shotIndex} \u6BB5` : "",
    typeof anchor.durationSeconds === "number" ? `\u76EE\u6807\u65F6\u957F\uFF1A${anchor.durationSeconds}s` : "",
    anchor.sceneAnchor ? `\u5206\u955C\u6307\u4EE4\uFF1A${anchor.sceneAnchor}` : "",
    anchor.dialogueLines?.length ? `\u672C\u6BB5\u53F0\u8BCD\uFF1A${anchor.dialogueLines.map((line) => `\u300C${line}\u300D`).join(" / ")}` : "",
    anchor.voiceoverText ? `\u672C\u6BB5\u65C1\u767D\uFF1A${anchor.voiceoverText}` : "",
    typeof anchor.speechBudgetSeconds === "number" && anchor.speechBudgetSeconds > 0 ? `\u53E3\u64AD\u9884\u7B97\uFF1A${anchor.speechBudgetSeconds}s\uFF086 \u9762\u677F\u52A8\u4F5C\u8282\u594F\u5FC5\u987B\u7ED9\u53D1\u58F0\u7559\u767D\uFF09` : "",
    anchor.transitionHint ? `\u8854\u63A5\u65B9\u5F0F\uFF1A${anchor.transitionHint}` : "",
    anchor.promptOverride ? `\u8865\u5145\u7EA6\u675F\uFF1A${anchor.promptOverride}` : "",
    STORYBOARD_CONTENT_ANCHOR_FOOTER
  ].filter(Boolean);
  return lines.length > 2 ? lines.join("\n") : "";
}
function buildImageIntegrityGuardrails(panelLabels) {
  return [
    ...IMAGE_INTEGRITY_GUARDRAIL_LINES.prefix,
    panelLabels ? IMAGE_INTEGRITY_GUARDRAIL_LINES.withLabels : IMAGE_INTEGRITY_GUARDRAIL_LINES.withoutLabels
  ].join("\n");
}
function buildGridNodeContractBlock(nodeRole, endingKind, choiceRevealMoment) {
  if (nodeRole === "ending" && endingKind) {
    const entry = ENDING_LIGHT_PROMPTS[endingKind];
    const endingLabel = getEndingLabel(endingKind);
    return [
      GRID_ENDING_CONTRACT_TITLE,
      `\u7ED3\u5C40\u7C7B\u578B\uFF1A${endingKind}\uFF08${endingLabel}\uFF09\u3002`,
      `Panels 5-6 \u5FC5\u987B\u6536\u655B\u5230\u7ED3\u5C40\u5B9A\u683C\uFF1A${entry.imageLighting}\u3002`,
      GRID_ENDING_CONTRACT_FIXED_LINES.panel9Final,
      `\u672C\u6BB5\u786C\u5951\u7EA6\u4E2D\u5FC5\u987B\u51FA\u73B0\u4EE5\u4E0B\u8BCD\u4E4B\u4E00\uFF1A${entry.mustInclude.join(" / ")}\u3002`,
      GRID_ENDING_CONTRACT_FIXED_LINES.lightingDirectionLock
    ].join("\n");
  }
  if (nodeRole === "key-choice") {
    const focus = resolveKeyChoiceFocus(choiceRevealMoment) ?? GRID_KEY_CHOICE_FOCUS_FALLBACK;
    return [
      GRID_KEY_CHOICE_CONTRACT_TITLE,
      `Panels 4-6 \u5FC5\u987B\u6301\u7EED\u63A8\u5411\u6289\u62E9\u538B\u529B\u7126\u70B9\uFF08\u63D0\u53D6\u81EA choiceRevealMoment\uFF09\uFF1A${focus}\u3002`,
      GRID_KEY_CHOICE_CONTRACT_FIXED_LINES.panel9Freeze,
      GRID_KEY_CHOICE_CONTRACT_FIXED_LINES.panel9Composition,
      GRID_KEY_CHOICE_CONTRACT_FIXED_LINES.forbidden
    ].join("\n");
  }
  return "";
}
function sanitizeShotGridOriginalPrompt(value, panelLabels) {
  const base = sanitizeLegacyShotStyle(value);
  let result = base.replace(
    SANITIZE_NEGATIVE_PROMPT_PATTERN,
    panelLabels ? SANITIZE_NEGATIVE_REPLACE.withLabels : SANITIZE_NEGATIVE_REPLACE.withoutLabels
  );
  for (const [pattern, replacement] of SANITIZE_LAYOUT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function sanitizeLegacyShotStyle(value) {
  return value.replace(
    SANITIZE_LEGACY_STYLE_PATTERN,
    "Style: black-and-white hand-drawn pencil line-art storyboard only, monochrome rough sketch, no color fill, no colored background, no colored clothing, no painterly rendering; color only for annotation arrows and tiny markup symbols."
  );
}

// server/engine/fmv/video-binding.ts
var ANTI_CLONE_COMPACT_CONSTRAINT = "\u89D2\u8272\u552F\u4E00\u6027\uFF1A\u6BCF\u4E2A @ \u89D2\u8272\u4EC5 1 \u4E2A\u5B9E\u4F8B\uFF1B\u7981\u6B62\u590D\u5236\u4EBA\u3001\u955C\u50CF\u3001\u91CD\u5F71\u3001\u53CC\u91CD\u66DD\u5149\u3001\u9762\u90E8\u878D\u5408\u6216\u8EAB\u4EFD\u4E32\u6270\u3002";
var STYLIZED_TEXTURE_COMPACT_CONSTRAINT = "\u8D28\u611F\uFF1A\u4FDD\u7559\u5FAE\u8868\u60C5\u3001\u53D1\u4E1D\u3001\u8863\u7269\u8936\u76B1\u3001\u96E8\u96FE/\u5C18\u57C3\u3001\u91D1\u5C5E\u73BB\u7483\u53CD\u5C04\u548C\u9634\u5F71\u5C42\u6B21\uFF1B\u907F\u514D\u5851\u6599\u611F\u4E0E\u5168\u753B\u9762\u7EDF\u4E00\u9510\u5EA6\u3002";
var CHINESE_DIALOGUE_CONSTRAINT = "\u6240\u6709\u89D2\u8272\u5BF9\u767D\u4E0E\u4EBA\u58F0\u4E3A\u7B80\u4F53\u4E2D\u6587\u666E\u901A\u8BDD\u53D1\u97F3\uFF0C\u53E3\u578B\u4E0E\u4E2D\u6587\u97F3\u8282\u540C\u6B65\uFF1B\u4E25\u7981\u8BF4\u82F1\u8BED / \u65E5\u8BED / \u5176\u4ED6\u8BED\u79CD\u3002";
var NO_WATERMARK_BGM_COMPACT_CONSTRAINT = "\u65E0\u97F3\u4E50\u3001\u65E0 BGM\u3001\u65E0\u914D\u4E50\u3001\u65E0\u6C34\u5370\u3001\u65E0 Logo\u3001\u65E0 UI\u3002";
var SEEDANCE_CUT_TERM_SOFTEN_MAP = [
  [/硬切入/g, "\u76F4\u63A5\u8D77\u955C"],
  [/反打切至/g, "\u53CD\u6253\u955C\u5934"],
  [/甩镜跳切/g, "\u5FEB\u901F\u6447\u955C"],
  [/视线引导至/g, "\u6CBF\u89C6\u7EBF\u65B9\u5411"],
  [/仰角切入/g, "\u4F4E\u89D2\u5EA6\u5207\u5165"],
  [/留白收束/g, "\u955C\u5934\u7F13\u6162\u843D\u5E45"]
];
function softenSeedanceCutTerms(text) {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of SEEDANCE_CUT_TERM_SOFTEN_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function inferSeedanceTaskMode(roles) {
  if (roles.some((role) => role.role === "extend_video")) return "extend";
  if (roles.some((role) => role.role === "keyframe_first") && roles.some((role) => role.role === "keyframe_last")) {
    return "first_last_frame";
  }
  return "reference";
}
function buildTaskModeLine(taskMode) {
  if (taskMode === "extend") {
    return "\u5411\u540E\u5EF6\u957F @\u89C6\u98911\uFF0C\u65F6\u5E8F\u5EF6\u7EED\u4EE5 @\u89C6\u98911 \u4E3A\u552F\u4E00\u57FA\u51C6\uFF0C\u9996\u5E27\u7D27\u63A5\u5176\u672B\u5E27\u7684\u4EBA\u7269\u59FF\u6001\u3001\u8868\u60C5\u3001\u5149\u5F71\u548C\u955C\u5934\u4F4D\u7F6E\uFF1B\u7981\u6B62\u8DF3\u5207\u3001\u8DF3\u5E27\u6216\u91CD\u7F6E\u573A\u666F\u3002";
  }
  if (taskMode === "edit") {
    return "\u4E25\u683C\u7F16\u8F91 @\u89C6\u98911\uFF0C\u4EC5\u4FEE\u6539\u88AB\u660E\u786E\u70B9\u540D\u7684\u5143\u7D20\uFF1B\u672A\u63D0\u53CA\u7684\u4EBA\u7269\u8EAB\u4EFD\u3001\u52A8\u4F5C\u3001\u8FD0\u955C\u548C\u573A\u666F\u4FDD\u6301\u4E0D\u53D8\u3002";
  }
  if (taskMode === "first_last_frame") {
    return "\u89C6\u9891\u4ECE\u9996\u5E27\u5173\u952E\u5E27\u81EA\u7136\u8D77\u52BF\uFF0C\u5E76\u5728\u7ED3\u5C3E\u5E73\u6ED1\u6536\u675F\u5230\u5C3E\u5E27\u5173\u952E\u5E27\u3002";
  }
  return "";
}
function buildSubjectAnchorOpening(roles) {
  if (!roles.length) return "";
  const lines = ["\u3010\u53C2\u8003\u56FE\u804C\u8D23\u3011"];
  for (const r of roles.filter((x) => x.productionType === "character_ref")) {
    const displayName = r.bibleName.trim() || "\u89D2\u8272";
    lines.push(`${r.atSlot}\u300C${displayName}\u300D\u4EBA\u7269\u8BBE\u5B9A\u56FE\uFF0C\u4EC5\u9501\u5B9A\u8138\u578B\u3001\u53D1\u578B\u3001\u670D\u88C5\u3001\u4F53\u6001\u3002`);
  }
  for (const r of roles.filter((x) => x.productionType === "scene_ref")) {
    lines.push(`${r.atSlot}\u300C${r.bibleName.trim() || "\u573A\u666F"}\u300D\u573A\u666F\u8BBE\u5B9A\u56FE\uFF0C\u4EC5\u9501\u5B9A\u7A7A\u95F4\u7ED3\u6784\u3001\u9648\u8BBE\u3001\u5149\u5F71\u65B9\u5411\u3002`);
  }
  for (const r of roles.filter((x) => x.productionType === "prop_ref")) {
    lines.push(`${r.atSlot}\u300C${r.bibleName.trim() || "\u9053\u5177"}\u300D\u9053\u5177\u8BBE\u5B9A\u56FE\uFF0C\u4EC5\u9501\u5B9A\u6750\u8D28\u3001\u5F62\u72B6\u3002`);
  }
  for (const r of roles.filter((x) => x.role === "palette_anchor")) {
    lines.push(`${r.atSlot} \u8272\u5361\u951A\u5B9A\uFF1A\u4EC5\u9501\u5B9A\u6574\u4F53\u8272\u5F69\u8303\u56F4\u3001\u660E\u6697\u5173\u7CFB\u548C\u60C5\u7EEA\u8272\u8C03\uFF0C\u4E0D\u6539\u53D8\u89D2\u8272\u8EAB\u4EFD\u4E0E\u573A\u666F\u7ED3\u6784\u3002`);
  }
  const first = roles.find((r) => r.role === "keyframe_first");
  const last = roles.find((r) => r.role === "keyframe_last");
  if (first) lines.push(`${first.atSlot} \u4F5C\u4E3A\u9996\u5E27\uFF08\u9996\u5E27\u9075\u4ECE\u5EA6 \u2265 85%\uFF09\u3002`);
  if (last) lines.push(`${last.atSlot} \u4F5C\u4E3A\u5C3E\u5E27\u76EE\u6807\u3002`);
  const styleAnchor = roles.find((r) => r.productionType === "style_anchor_frame");
  if (styleAnchor && styleAnchor.role !== "palette_anchor") {
    lines.push(`${styleAnchor.atSlot} \u98CE\u683C\u951A\u5E27\uFF0C\u4EC5\u7EE7\u627F\u7F8E\u672F\u98CE\u683C\u3001\u6784\u56FE\u3001\u8272\u8C03\u4E0E\u60C5\u7EEA\u6C1B\u56F4\u3002`);
  }
  const extendVideo = roles.find((r) => r.role === "extend_video");
  if (extendVideo) {
    lines.push(`\u5EF6\u957F ${extendVideo.atSlot}\u300C${extendVideo.bibleName.trim() || "\u4E0A\u4E00\u6BB5"}\u300D\uFF0C\u9996\u5E27\u7D27\u63A5\u5176\u672B\u5E27\u3002`);
  }
  const effectVideo = roles.find((r) => r.role === "effect_reference");
  if (effectVideo) {
    lines.push(`${effectVideo.atSlot} \u7279\u6548\u8FD0\u52A8\u53C2\u8003\uFF0C\u4EC5\u5B66\u4E60\u7279\u6548\u5F62\u6001\u4E0E\u8FD0\u52A8\u903B\u8F91\u3002`);
  }
  const storyboard = roles.find((r) => r.role === "storyboard");
  if (storyboard) {
    lines.push(`${storyboard.atSlot} \u5206\u955C\u8282\u594F\u53C2\u8003\uFF0C\u6309\u9762\u677F\u987A\u5E8F\u6267\u884C\u3002`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
function buildTopPriorityConstraints(roles) {
  const rules = ["\u3010\u6700\u9AD8\u4F18\u5148\u7EA7\u7EA6\u675F\u3011", ANTI_CLONE_COMPACT_CONSTRAINT];
  const sceneRole = roles.find((r) => r.productionType === "scene_ref");
  if (sceneRole) {
    rules.push(`\u573A\u666F\u5EFA\u7B51\u7ED3\u6784\u3001\u9648\u8BBE\u4E0E\u5149\u5F71\u65B9\u5411\u4EE5 ${sceneRole.atSlot} \u4E3A\u51C6\uFF0C\u4E0D\u5F97\u6539\u53D8\u3002`);
  }
  rules.push("\u4FDD\u6301\u65E0\u5B57\u5E55\uFF0C\u907F\u514D\u751F\u6210\u4EFB\u4F55\u6587\u5B57\u6216\u5B57\u5E55\uFF1B\u65E0 caption\u3001\u65E0\u5BF9\u8BDD\u6C14\u6CE1\u3001\u65E0\u753B\u9762\u6587\u5B57\u3001Logo\u3001UI\u3002");
  return rules.join("\n");
}
function buildStyleAndParamsBlock(styleKeywords, clipSeconds, aspectRatio) {
  const tier = clipSeconds <= 5 ? "S\u6863" : clipSeconds <= 10 ? "M\u6863" : "L\u6863";
  const contentWindow = clipSeconds >= 15 ? "\u6709\u6548\u5185\u5BB913-14s\uFF0C\u672B\u5C3E\u75591s\u81EA\u7136\u5B9A\u683C" : `\u6709\u6548\u5185\u5BB9\u7EA6${clipSeconds}s`;
  const styleLine = (styleKeywords ?? []).filter(Boolean).join("\uFF0C") || "\u7EDF\u4E00\u5F71\u89C6\u7EA7\u5199\u5B9E\u8D28\u611F";
  return [
    "\u3010STYLE LOCK + \u751F\u6210\u53C2\u6570\u3011",
    `${styleLine}\uFF1BSeedance 2.0\uFF0C\u753B\u5E45${aspectRatio}\uFF0C\u65F6\u957F${clipSeconds}s\xB7${tier}\uFF0C${contentWindow}\u3002`
  ].join("\n");
}
function bindingToRole(b) {
  const atSlot = `${b.isVideo ? "@\u89C6\u9891" : "@\u56FE\u7247"}${b.index}`;
  const label = b.label ?? "";
  const base = { atSlot, bibleName: label, summary: label };
  switch (b.role) {
    case "\u573A\u666F":
      return { ...base, productionType: "scene_ref", role: "background" };
    case "\u7EED\u63A5\u9996\u5E27":
      return { ...base, productionType: "shot_image", role: "keyframe_first" };
    case "\u5EF6\u957F\u89C6\u9891":
      return { ...base, productionType: "video_clip", role: "extend_video" };
    case "\u9053\u5177":
      return { ...base, productionType: "prop_ref", role: "prop" };
    case "\u8272\u5361":
      return { ...base, productionType: "style_anchor_frame", role: "palette_anchor" };
    case "\u98CE\u683C\u951A\u5E27":
      return { ...base, productionType: "style_anchor_frame", role: "style_anchor" };
    case "\u5206\u955C\u8282\u594F":
      return { ...base, productionType: "shot_image", role: "storyboard" };
    default:
      return { ...base, productionType: "character_ref", role: "protagonist" };
  }
}
function buildSeedanceVideoPrompt(input) {
  const clipSeconds = input.durationSeconds;
  const aspectRatio = input.aspectRatio ?? "16:9";
  const roles = input.refs.map(bindingToRole);
  const taskMode = input.taskMode ?? inferSeedanceTaskMode(roles);
  const styleAndParams = buildStyleAndParamsBlock(input.styleKeywords, clipSeconds, aspectRatio);
  const subjectAnchor = buildSubjectAnchorOpening(roles);
  const constraintBlock = buildTopPriorityConstraints(roles);
  const taskModeLine = buildTaskModeLine(taskMode);
  const rawSequence = (input.seedancePrompt?.trim() || input.storyText?.trim() || "").trim();
  const shotSequence = rawSequence ? `\u3010${clipSeconds}\u79D2\u8FD0\u955C\u3011
${softenSeedanceCutTerms(rawSequence)}` : `\u3010${clipSeconds}\u79D2\u8FD0\u955C\u3011
\u955C\u59341\uFF1A\u6309\u8282\u70B9\u5267\u60C5\u63A8\u8FDB\u8868\u6F14\u548C\u955C\u5934\u3002`;
  const body = [
    styleAndParams,
    subjectAnchor,
    constraintBlock,
    taskModeLine,
    shotSequence,
    CHINESE_DIALOGUE_CONSTRAINT,
    STYLIZED_TEXTURE_COMPACT_CONSTRAINT,
    NO_WATERMARK_BGM_COMPACT_CONSTRAINT
  ].filter((s) => s.trim().length > 0).join("\n");
  if (input.extend) {
    const extendHeader = input.transitionHint ? `${VIDEO_EXTEND_HEADER_BLOCK}
7. \u8854\u63A5\u951A\u70B9\uFF1A${input.transitionHint}` : VIDEO_EXTEND_HEADER_BLOCK;
    return [extendHeader, body].join("\n");
  }
  return body;
}

// server/generation/orchestrate.ts
function assertRefs(input) {
  if (!input.characterRefIds.some(Boolean) || !input.sceneRefIds.some(Boolean)) {
    throw new Error("\u89C6\u9891\u751F\u6210\u7F3A\u5FC5\u4F20\u53C2\u8003\u56FE\uFF1Acharacter_ref\uFF08\u89D2\u8272\u53C2\u8003\u56FE\uFF09+ scene_ref\uFF08\u573A\u666F\u53C2\u8003\u56FE\uFF09");
  }
}
function generated(assets, type) {
  const asset = assets.find((candidate) => candidate.type === type);
  if (!asset) throw new Error(`Model gateway did not return a generated ${type}`);
  return asset;
}
async function axes(registry, override) {
  return composeAxes({ ...await registry.getStyleAxes() ?? {}, ...override ?? {} });
}
async function references(registry, ids) {
  return Promise.all(ids.filter(Boolean).map((id) => registry.mediaReference(id)));
}
function generationError(error) {
  return (error instanceof Error ? error.message : "Generation failed").replace(/file:\/\/\S+/gi, "[redacted]").replace(/https?:\/\/\S+/gi, "[redacted]").slice(0, 400);
}
function parseShotScript(raw, durationSeconds) {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const values = Array.isArray(parsed) ? parsed : parsed.shots ?? [];
    const shots = values.flatMap((value, index) => {
      const shot = value;
      return typeof shot.seedancePrompt === "string" && shot.seedancePrompt.trim() ? [{ shotNumber: typeof shot.shotNumber === "number" ? shot.shotNumber : index + 1, durationSeconds: typeof shot.durationSeconds === "number" ? shot.durationSeconds : durationSeconds, seedancePrompt: shot.seedancePrompt.trim() }] : [];
    });
    if (shots.length) return shots;
  } catch {
  }
  return [{ shotNumber: 1, durationSeconds, seedancePrompt: cleaned.slice(0, 700) }];
}
function splitDurationIntoSegments(totalSeconds) {
  const count = getShotCount(totalSeconds);
  const base = Math.floor(totalSeconds / count);
  return Array.from({ length: count }, (_, index) => base + (index < totalSeconds - base * count ? 1 : 0));
}
function createHostGenerationOrchestrator(context, registry = createHostAssetRegistry(context)) {
  const keyframe = async (input) => {
    const mode = input.mode ?? "keyframe";
    const productionType = mode === "grid_storyboard" ? "grid_storyboard" : "shot_image";
    const id = makeAssetId(productionType);
    const label = input.label ?? (mode === "grid_storyboard" ? `\u5206\u955C\u6545\u4E8B\u677F \xB7 ${input.nodeName}` : `\u5173\u952E\u5E27 \xB7 ${input.nodeName}`);
    await registry.upsert({ id, kind: "image", productionType, status: "generating", label, sceneNodeId: input.sceneNodeId, sourceModule: "wb-game-video", createdAt: Date.now(), updatedAt: Date.now() });
    try {
      const refs = await references(registry, input.refAssetIds ?? []);
      const style = await axes(registry, input.styleAxes);
      const base = buildShotImagePrompt({ ...input, uiStylePrompt: input.uiStylePrompt ?? style.uiStylePrompt, refsReady: refs.length > 0 });
      const prompt = mode === "grid_storyboard" ? buildShotGridStoryboardPrompt({ ...input.grid ?? {}, originalPrompt: base, referenceCount: refs.length, sceneRefReady: refs.length > 0 }) : base;
      return await registry.persistGenerated(generated((await context.models.generateImage({ prompt, references: refs, aspectRatio: "1:1", metadata: { sceneNodeId: input.sceneNodeId, productionType } })).assets, "image"), { registryId: id, filenamePrefix: mode === "grid_storyboard" ? "storyboard" : "keyframe", productionType, sceneNodeId: input.sceneNodeId, label, prompt, meta: { refIds: input.refAssetIds ?? [], mode } });
    } catch (error) {
      await registry.update(id, { status: "failed", error: generationError(error) });
      throw error;
    }
  };
  const video = async (input) => {
    assertRefs(input);
    const id = makeAssetId("video_clip");
    const label = input.label ?? `\u89C6\u9891 \xB7 ${input.nodeName}`;
    await registry.upsert({ id, kind: "video", productionType: "video_clip", status: "generating", label, sceneNodeId: input.sceneNodeId, sourceModule: "wb-game-video", createdAt: Date.now(), updatedAt: Date.now() });
    try {
      const style = await axes(registry, input.styleAxes);
      const refs = await references(registry, [input.continuityFirstFrameId ?? "", ...input.characterRefIds, ...input.sceneRefIds]);
      const bindings = refs.map((_, index) => ({ index: index + 1, role: index === 0 && input.continuityFirstFrameId ? "\u7EED\u63A5\u9996\u5E27" : index < input.characterRefIds.length + Number(Boolean(input.continuityFirstFrameId)) ? "\u89D2\u8272" : "\u573A\u666F" }));
      const prompt = buildSeedanceVideoPrompt({ seedancePrompt: input.seedancePrompt, storyText: input.storyText, nodeName: input.nodeName, durationSeconds: input.durationSeconds, artStyle: input.artStyle ?? style.artMedia, styleKeywords: input.styleKeywords ?? style.styleKeywords, refs: bindings, extend: input.extend, transitionHint: input.transitionHint });
      return await registry.persistGenerated(generated((await context.models.generateVideo({ prompt, references: refs, durationSeconds: input.durationSeconds, metadata: { sceneNodeId: input.sceneNodeId, generateAudio: input.generateAudio ?? false, extend: input.extend ?? false } })).assets, "video"), { registryId: id, filenamePrefix: "video", productionType: "video_clip", sceneNodeId: input.sceneNodeId, label, prompt, durationMs: Math.round(input.durationSeconds * 1e3), meta: { characterRefIds: input.characterRefIds, sceneRefIds: input.sceneRefIds } });
    } catch (error) {
      const failed = await registry.update(id, { status: "failed", error: generationError(error) });
      if (failed) throw Object.assign(error instanceof Error ? error : new Error(generationError(error)), { asset: failed });
      throw error;
    }
  };
  return {
    async generateShotScript(input) {
      const style = await axes(registry, input.styleAxes);
      const text = await context.models.generateText({ prompt: buildNodeShotScriptPrompt({ ...input, artStyle: input.artStyle ?? style.artMedia, styleKeywords: input.styleKeywords ?? style.styleKeywords }), system: style.directorSystem || void 0, temperature: 0.7, metadata: { responseFormat: "json" } });
      return parseShotScript(text.text, input.durationSeconds);
    },
    generateKeyframe: keyframe,
    generateVideo: video,
    async generateNodeVideo(input) {
      assertRefs(input);
      const segments = splitDurationIntoSegments(input.durationSeconds);
      const assets = [];
      for (const [index, durationSeconds] of segments.entries()) {
        try {
          assets.push(await video({ ...input, durationSeconds, label: `${input.label ?? `\u89C6\u9891 \xB7 ${input.nodeName}`} \xB7 \u6BB5${index + 1}/${segments.length}`, extend: index > 0, transitionHint: index > 0 ? input.transitionHint ?? `\u63A5\u4E0A\u4E00\u6BB5\uFF08\u7B2C ${index} \u6BB5\uFF09\u5C3E\u90E8\uFF0C\u4EBA\u7269\u3001\u673A\u4F4D\u3001\u5149\u5F71\u3001\u8868\u6F14\u8282\u594F\u65E0\u7F1D\u5EF6\u7EED` : void 0 }));
        } catch (error) {
          const asset = error.asset;
          if (asset) assets.push(asset);
          break;
        }
      }
      return assets;
    }
  };
}

// server/intake/characters.ts
import { existsSync as existsSync2, readdirSync, readFileSync as readFileSync3, statSync as statSync2 } from "fs";
import { resolve as resolve2 } from "path";
function pickPortraitRel(m) {
  const p = m.portrait ?? {};
  return p.front ?? p.current ?? p.three_quarter ?? Object.values(p).find(Boolean) ?? m.pipelines?.turnaround?.views?.front ?? Object.values(m.pipelines?.turnaround?.views ?? {}).find(Boolean);
}
function safeCharacterId(value) {
  return value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}
function boundedPortraitPath(charId, value) {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("Character portrait must be a bounded relative path");
  }
  return `characters/${charId}/${normalized}`;
}
async function importCharacterRefsFromHost(context, registry = createHostAssetRegistry(context)) {
  const entries = await context.files.list("characters");
  const refs = [];
  for (const charId of entries) {
    if (!safeCharacterId(charId)) continue;
    const manifestBytes = await context.files.read(
      `characters/${charId}/manifest.json`
    );
    if (!manifestBytes) continue;
    let manifest;
    try {
      manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    } catch {
      continue;
    }
    if (manifest.charId !== void 0 && manifest.charId !== charId) continue;
    const portrait = pickPortraitRel(manifest);
    if (typeof portrait !== "string" || !portrait) continue;
    try {
      const relativePath = boundedPortraitPath(charId, portrait);
      const mime = mimeForPath(portrait);
      refs.push(await registry.importGameFile({
        registryId: `a-charref-${charId}`,
        relativePath,
        filename: `character-${charId.replace(/[^a-z0-9_-]+/gi, "-") || "character"}.${mime.split("/")[1] ?? "png"}`,
        contentType: mime,
        productionType: "character_ref",
        label: manifest.name || charId,
        sourceModule: "wb-character",
        meta: { charId, role: manifest.role }
      }));
    } catch (error) {
      if (error instanceof Error && (error instanceof TypeError || error.message.startsWith("Reference media was not found:"))) {
        continue;
      }
      throw error;
    }
  }
  return refs;
}

// server/intake/scenes.ts
import { existsSync as existsSync3, readFileSync as readFileSync4 } from "fs";
import { resolve as resolve3 } from "path";
function boundedTexturePath(value) {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("Texture file must be a bounded relative path");
  }
  return `textures/${normalized}`;
}
function hostSceneId(desc) {
  const key = desc.sha256 ?? desc.file;
  if (!key) return null;
  const safe = key.replace(/[^a-z0-9]/gi, "").slice(0, 24);
  return safe ? `a-sceneref-${safe}` : null;
}
async function importSceneRefsFromHost(context, registry = createHostAssetRegistry(context)) {
  const bytes = await context.files.read("textures/index.json");
  if (!bytes) return [];
  let list;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  const refs = [];
  for (const desc of list) {
    if (!desc.file) continue;
    const id = hostSceneId(desc);
    if (!id) continue;
    try {
      const relativePath = boundedTexturePath(desc.file);
      refs.push(await registry.importGameFile({
        registryId: id,
        relativePath,
        filename: `scene-${id.slice("a-sceneref-".length)}.${mimeForPath(desc.file).split("/")[1] ?? "png"}`,
        contentType: desc.mimeType || mimeForPath(desc.file),
        productionType: "scene_ref",
        label: desc.assetName || desc.assetType || "scene",
        sourceModule: "wb-2d-scene-asset-generator",
        meta: { assetType: desc.assetType, sha256: desc.sha256 }
      }));
    } catch (error) {
      if (error instanceof Error && (error instanceof TypeError || error.message.startsWith("Reference media was not found:"))) {
        continue;
      }
      throw error;
    }
  }
  return refs;
}

// server/host/service-validation.ts
import Ajv2020 from "ajv/dist/2020.js";

// schemas/generate-keyframe.args.json
var generate_keyframe_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:generate-keyframe args",
  type: "object",
  additionalProperties: false,
  required: ["sceneNodeId", "nodeName", "beat"],
  properties: {
    sceneNodeId: { type: "string", description: "Owning GameGraph node id." },
    nodeName: { type: "string", description: "Stable node name." },
    beat: { type: "string", description: "Story beat / visual intent for the frame (the picture core instruction)." },
    variant: { enum: ["video_first_frame", "choice_pressure_frame"], description: "Keyframe purpose (default video_first_frame)." },
    perspective: { enum: ["first", "third"], description: "first = POV (triggers first-person framing), third = cinematic." },
    characters: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" }, desc: { type: "string" } } }
    },
    location: { type: "string" },
    refAssetIds: { type: "array", items: { type: "string" }, description: "character_ref / scene_ref registry ids used as read-only reference images." },
    label: { type: "string" },
    styleAxes: {
      type: "object",
      additionalProperties: false,
      description: "Per-node style-axis override (wb-reel 3-axis). Falls back to game-level manifest.styleAxes. artMedia+filmLook compose the uiStylePrompt.",
      properties: {
        artMedia: { type: "string" },
        director: { type: "string" },
        filmLook: { type: "string" }
      }
    },
    mode: {
      enum: ["keyframe", "grid_storyboard"],
      description: "keyframe (default) = single colored keyframe -> shot_image. grid_storyboard = 6-panel black-and-white previs storyboard -> grid_storyboard."
    },
    grid: {
      type: "object",
      additionalProperties: false,
      description: "Extra inputs when mode=grid_storyboard (all optional). originalPrompt/referenceCount/sceneRefReady are derived internally.",
      properties: {
        panelLabels: { type: "boolean", description: "Render panel numbers + shot notes inside each panel (default true)." },
        nodeRole: { enum: ["ending", "key-choice", "multi-choice", "regular"], description: "Node semantic role; ending / key-choice inject extra freeze-frame hard contracts." },
        endingKind: { enum: ["good", "bad", "neutral"], description: "Ending type (nodeRole=ending)." },
        choiceRevealMoment: { type: "string", description: "Choice-pressure focus text (nodeRole=key-choice)." },
        atmosphereOverride: { type: "string" },
        nodeTimeOfDay: { type: "string" }
      }
    }
  }
};

// schemas/generate-node-video.args.json
var generate_node_video_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:generate-node-video args",
  type: "object",
  additionalProperties: false,
  required: ["sceneNodeId", "nodeName", "characterRefIds", "sceneRefIds"],
  properties: {
    sceneNodeId: { type: "string", description: "Owning GameGraph node id." },
    nodeName: { type: "string" },
    seedancePrompt: { type: "string", description: "Reviewed shot script (preferred main sequence)." },
    storyText: { type: "string", description: "Fallback node story text when seedancePrompt is absent." },
    durationSeconds: { type: "number", minimum: 1, maximum: 120, description: "Total node duration. > 15s auto-splits into 15s segments; segment 2+ becomes an extend continuation." },
    artStyle: { type: "string" },
    styleKeywords: { type: "array", items: { type: "string" } },
    characterRefIds: { type: "array", items: { type: "string" }, minItems: 1, description: "REQUIRED: >=1 character_ref registry id." },
    sceneRefIds: { type: "array", items: { type: "string" }, minItems: 1, description: "REQUIRED: >=1 scene_ref registry id." },
    continuityFirstFrameId: { type: "string", description: "Keyframe registry id used as first_frame seam for extend segments (no mp4 tail extraction in headless)." },
    label: { type: "string" },
    generateAudio: { type: "boolean" },
    transitionHint: { type: "string", description: "Seam description for extend segments; a default is used when omitted." },
    styleAxes: {
      type: "object",
      additionalProperties: false,
      properties: {
        artMedia: { type: "string" },
        director: { type: "string" },
        filmLook: { type: "string" }
      }
    }
  }
};

// schemas/generate-shot-script.args.json
var generate_shot_script_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:generate-shot-script args",
  type: "object",
  additionalProperties: false,
  required: ["nodeName", "storyText"],
  properties: {
    sceneNodeId: { type: "string", description: "Owning GameGraph node id (one node = one shot)." },
    nodeName: { type: "string", description: "Stable node name used to refer to the subject." },
    storyText: { type: "string", description: "The node's story/performance intent text." },
    durationSeconds: { type: "number", minimum: 1, maximum: 60, description: "Target performance duration in seconds (default 8)." },
    artStyle: { type: "string", description: "Art-style preset id (see prompts/_shared/style-bible)." },
    styleKeywords: { type: "array", items: { type: "string" }, description: "Extra style keywords." },
    perspective: { enum: ["first", "third"], description: "first = POV, third = cinematic." },
    tone: { type: "string", description: "Genre/tone (e.g. urban thriller)." },
    characters: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" }, desc: { type: "string" } } },
      description: "On-screen characters (thin info mapped from character_ref)."
    },
    location: { type: "string", description: "Scene description (thin info mapped from scene_ref)." },
    interactive: { type: "boolean", description: "Whether this node is interactive (>=2 choices, non-ending)." },
    choiceCount: { type: "number", description: "Number of choices when interactive." },
    styleAxes: {
      type: "object",
      additionalProperties: false,
      description: "Per-node style-axis override (wb-reel 3-axis). Falls back to game-level manifest.styleAxes. artMedia/filmLook fold into art style + keywords; director folds into the system prompt (director persona).",
      properties: {
        artMedia: { type: "string", description: "Art-media axis id (e.g. photoreal / anime / ink)." },
        director: { type: "string", description: "Director axis id (e.g. minimal-epic / precision-noir)." },
        filmLook: { type: "string", description: "Film-look axis id (e.g. teal-orange / noir-lowkey)." }
      }
    }
  }
};

// schemas/generate-video.args.json
var generate_video_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:generate-video args",
  type: "object",
  additionalProperties: false,
  required: ["sceneNodeId", "nodeName", "characterRefIds", "sceneRefIds"],
  properties: {
    sceneNodeId: { type: "string", description: "Owning GameGraph node id; the resulting video_clip is meant for node.data.media.ref." },
    nodeName: { type: "string" },
    seedancePrompt: { type: "string", description: "Reviewed shot script (preferred main sequence)." },
    storyText: { type: "string", description: "Fallback node story text when seedancePrompt is absent." },
    durationSeconds: { type: "number", minimum: 1, maximum: 60, description: "Video duration in seconds (default 8)." },
    artStyle: { type: "string" },
    styleKeywords: { type: "array", items: { type: "string" } },
    characterRefIds: { type: "array", items: { type: "string" }, minItems: 1, description: "REQUIRED: >=1 character_ref registry id. Missing -> hard error (no silent degrade)." },
    sceneRefIds: { type: "array", items: { type: "string" }, minItems: 1, description: "REQUIRED: >=1 scene_ref registry id. Missing -> hard error." },
    continuityFirstFrameId: { type: "string", description: "Optional keyframe registry id used as first_frame for shot-to-shot continuity." },
    label: { type: "string" },
    generateAudio: { type: "boolean", description: "Whether to ask the gateway to generate audio (default false)." },
    styleAxes: {
      type: "object",
      additionalProperties: false,
      description: "Per-node style-axis override (wb-reel 3-axis). Falls back to game-level manifest.styleAxes.",
      properties: {
        artMedia: { type: "string" },
        director: { type: "string" },
        filmLook: { type: "string" }
      }
    },
    extend: { type: "boolean", description: "Extend segment: prepend the V-PROMPT-15 video-extend header (7 continuity rules) so this clip seamlessly continues the previous one." },
    transitionHint: { type: "string", description: "Seam description appended to the extend header (e.g. 'continue from the previous segment tail')." }
  }
};

// schemas/get-asset.args.json
var get_asset_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:get-asset args",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", description: "Asset id to fetch." }
  }
};

// schemas/get-graph.args.json
var get_graph_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:get-graph args",
  type: "object",
  additionalProperties: false,
  properties: {}
};

// schemas/import-character-refs.args.json
var import_character_refs_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:import-character-refs args",
  type: "object",
  additionalProperties: false,
  properties: {}
};

// schemas/import-scene-refs.args.json
var import_scene_refs_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:import-scene-refs args",
  type: "object",
  additionalProperties: false,
  properties: {}
};

// schemas/list-assets.args.json
var list_assets_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:list-assets args",
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { enum: ["image", "video"], description: "Filter by media kind." },
    productionType: { enum: ["character_ref", "scene_ref", "shot_image", "video_clip"], description: "Filter by production type." },
    sceneNodeId: { type: "string", description: "Filter by owning node id." }
  }
};

// schemas/list-videos.args.json
var list_videos_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:list-videos args",
  type: "object",
  additionalProperties: false,
  properties: {}
};

// schemas/save-graph.args.json
var save_graph_args_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "wb-game-video:save-graph args",
  type: "object",
  additionalProperties: false,
  required: ["project"],
  properties: {
    project: {
      type: "object",
      description: "Full GraphLibraryDocument to persist (scenario + manifest with main and sub blueprints). Whole-document overwrite into blueprint.json."
    },
    title: {
      type: "string",
      description: "Reserved human-readable label. Accepted for compatibility but currently ignored."
    }
  }
};

// server/host/service-validation.ts
var ajv = new Ajv2020({ allErrors: true, strict: true });
var validators = {
  getGraph: ajv.compile(get_graph_args_default),
  saveGraph: ajv.compile(save_graph_args_default),
  listAssets: ajv.compile(list_assets_args_default),
  listVideos: ajv.compile(list_videos_args_default),
  getAsset: ajv.compile(get_asset_args_default),
  importCharacterRefs: ajv.compile(import_character_refs_args_default),
  importSceneRefs: ajv.compile(import_scene_refs_args_default),
  generateShotScript: ajv.compile(generate_shot_script_args_default),
  generateKeyframe: ajv.compile(generate_keyframe_args_default),
  generateVideo: ajv.compile(generate_video_args_default),
  generateNodeVideo: ajv.compile(generate_node_video_args_default)
};
function message(error) {
  const target = error.instancePath || "input";
  return `${target} ${error.message ?? "is invalid"}`;
}
function validateServiceInput(schema, value) {
  const validate = validators[schema];
  return validate(value) ? [] : (validate.errors ?? []).map(message);
}

// server/host/wb-service.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var BLUEPRINT_FILE = "blueprint.json";
var PROJECT_FILE = "project.json";
var GRAPH_SAVE_LOCK = "wb-game-video-graph-save";
var WbServiceInputError = class extends TypeError {
  code = "invalid_input";
};
function assertSchema(schema, value) {
  const errors = validateServiceInput(schema, value);
  if (errors.length) throw new WbServiceInputError(errors.join("; "));
}
function publicErrorMessage(error) {
  const raw = error instanceof Error && typeof error.message === "string" ? error.message : "Operation failed";
  return sanitizePublicText(raw).slice(0, 400);
}
function record(value, label = "Input") {
  if (value === void 0) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WbServiceInputError(`${label} must be an object`);
  }
  return value;
}
function stringValue(value, name, required = false) {
  if (value === void 0 && !required) return void 0;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WbServiceInputError(`${name} must be a non-empty string`);
  }
  return value;
}
function numberValue(value, name, fallback, maximum = Number.POSITIVE_INFINITY) {
  if (value === void 0) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new WbServiceInputError(`${name} must be a positive number`);
  }
  if (value > maximum) {
    throw new WbServiceInputError(`${name} must be at most ${maximum}`);
  }
  return value;
}
function stringArray(value, name, minimum = 0) {
  if (value === void 0) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new WbServiceInputError(`${name} must be an array of strings`);
  }
  const result = value.filter(Boolean);
  if (result.length < minimum) {
    throw new WbServiceInputError(`${name} must contain at least ${minimum} item`);
  }
  return result;
}
function assertLogicalIdentifier(value, label) {
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\") || /^(?:\/|[A-Za-z]:[\\/])/.test(value)) {
    throw new WbServiceInputError(`${label} must be a relative identifier`);
  }
  return value;
}
function getAssetIdFromArgs(value) {
  assertSchema("getAsset", value);
  const input = record(value);
  return assertLogicalIdentifier(
    stringValue(input.id, "id", true),
    "assetId"
  );
}
function assertOnlyKeys(input, allowed) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new WbServiceInputError("Input contains unsupported path or selector fields");
  }
}
function optionalStyleAxes(value) {
  if (value === void 0) return void 0;
  const input = record(value, "styleAxes");
  assertOnlyKeys(input, ["artMedia", "director", "filmLook"]);
  return {
    artMedia: stringValue(input.artMedia, "styleAxes.artMedia"),
    director: stringValue(input.director, "styleAxes.director"),
    filmLook: stringValue(input.filmLook, "styleAxes.filmLook")
  };
}
function perspective(value) {
  if (value === void 0) return void 0;
  if (value === "first") return "\u7B2C\u4E00\u4EBA\u79F0";
  if (value === "third") return "\u7B2C\u4E09\u4EBA\u79F0";
  throw new WbServiceInputError("perspective must be first or third");
}
function characters(value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) {
    throw new WbServiceInputError("characters must be an array");
  }
  return value.map((item) => {
    const input = record(item, "character");
    assertOnlyKeys(input, ["name", "desc"]);
    const name = stringValue(input.name, "character.name", true);
    const description = stringValue(input.desc, "character.desc");
    return description ? { name, appearance: description } : { name };
  });
}
function projectMetadata(gameId) {
  return {
    id: gameId,
    title: gameId,
    platform: "wb-game-video",
    platformVersion: "1",
    entry: {
      blueprint: BLUEPRINT_FILE,
      components: "dist/components"
    }
  };
}
function parseGraph(bytes) {
  if (!bytes) return null;
  try {
    return normalizeDocument(
      JSON.parse(decoder.decode(bytes))
    );
  } catch {
    return null;
  }
}
function shotScriptInput(value) {
  const input = record(value);
  assertOnlyKeys(input, [
    "sceneNodeId",
    "nodeName",
    "storyText",
    "durationSeconds",
    "artStyle",
    "styleKeywords",
    "perspective",
    "tone",
    "characters",
    "location",
    "interactive",
    "choiceCount",
    "styleAxes"
  ]);
  if (input.interactive !== void 0 && typeof input.interactive !== "boolean") {
    throw new WbServiceInputError("interactive must be a boolean");
  }
  return {
    nodeName: stringValue(input.nodeName, "nodeName", true),
    storyText: stringValue(input.storyText, "storyText", true),
    durationSeconds: numberValue(input.durationSeconds, "durationSeconds", 8, 60),
    artStyle: stringValue(input.artStyle, "artStyle"),
    styleKeywords: stringArray(input.styleKeywords, "styleKeywords"),
    perspective: perspective(input.perspective),
    tone: stringValue(input.tone, "tone"),
    characters: characters(input.characters),
    location: stringValue(input.location, "location"),
    choicesLength: input.choiceCount === void 0 ? input.interactive === true ? 2 : void 0 : numberValue(input.choiceCount, "choiceCount", 2),
    styleAxes: optionalStyleAxes(input.styleAxes)
  };
}
function keyframeInput(value) {
  const input = record(value);
  assertOnlyKeys(input, [
    "sceneNodeId",
    "nodeName",
    "beat",
    "variant",
    "perspective",
    "characters",
    "location",
    "refAssetIds",
    "label",
    "styleAxes",
    "mode",
    "grid"
  ]);
  const mode = input.mode;
  if (mode !== void 0 && mode !== "keyframe" && mode !== "grid_storyboard") {
    throw new WbServiceInputError("mode must be keyframe or grid_storyboard");
  }
  const variant = input.variant;
  if (variant !== void 0 && variant !== "video_first_frame" && variant !== "choice_pressure_frame") {
    throw new WbServiceInputError("variant is invalid");
  }
  return {
    sceneNodeId: stringValue(input.sceneNodeId, "sceneNodeId", true),
    nodeName: stringValue(input.nodeName, "nodeName", true),
    beat: stringValue(input.beat, "beat", true),
    variant,
    perspective: perspective(input.perspective),
    characters: characters(input.characters),
    location: stringValue(input.location, "location"),
    refAssetIds: stringArray(input.refAssetIds, "refAssetIds").map((id) => assertLogicalIdentifier(id, "refAssetIds item")),
    label: stringValue(input.label, "label"),
    styleAxes: optionalStyleAxes(input.styleAxes),
    mode,
    grid: input.grid === void 0 ? void 0 : (() => {
      const grid = record(input.grid, "grid");
      assertOnlyKeys(grid, [
        "panelLabels",
        "nodeRole",
        "endingKind",
        "choiceRevealMoment",
        "atmosphereOverride",
        "nodeTimeOfDay"
      ]);
      if (grid.panelLabels !== void 0 && typeof grid.panelLabels !== "boolean") {
        throw new WbServiceInputError("grid.panelLabels must be a boolean");
      }
      return grid;
    })()
  };
}
function videoInput(value, maximumDuration) {
  const input = record(value);
  assertOnlyKeys(input, [
    "sceneNodeId",
    "nodeName",
    "seedancePrompt",
    "storyText",
    "durationSeconds",
    "artStyle",
    "styleKeywords",
    "characterRefIds",
    "sceneRefIds",
    "continuityFirstFrameId",
    "label",
    "generateAudio",
    "styleAxes",
    "extend",
    "transitionHint"
  ]);
  for (const name of ["generateAudio", "extend"]) {
    if (input[name] !== void 0 && typeof input[name] !== "boolean") {
      throw new WbServiceInputError(`${name} must be a boolean`);
    }
  }
  return {
    sceneNodeId: stringValue(input.sceneNodeId, "sceneNodeId", true),
    nodeName: stringValue(input.nodeName, "nodeName", true),
    seedancePrompt: stringValue(input.seedancePrompt, "seedancePrompt"),
    storyText: stringValue(input.storyText, "storyText"),
    durationSeconds: numberValue(
      input.durationSeconds,
      "durationSeconds",
      8,
      maximumDuration
    ),
    artStyle: stringValue(input.artStyle, "artStyle"),
    styleKeywords: stringArray(input.styleKeywords, "styleKeywords"),
    characterRefIds: stringArray(input.characterRefIds, "characterRefIds", 1).map((id) => assertLogicalIdentifier(id, "characterRefIds item")),
    sceneRefIds: stringArray(input.sceneRefIds, "sceneRefIds", 1).map((id) => assertLogicalIdentifier(id, "sceneRefIds item")),
    continuityFirstFrameId: input.continuityFirstFrameId === void 0 ? void 0 : assertLogicalIdentifier(
      stringValue(input.continuityFirstFrameId, "continuityFirstFrameId", true),
      "continuityFirstFrameId"
    ),
    label: stringValue(input.label, "label"),
    generateAudio: input.generateAudio === true,
    styleAxes: optionalStyleAxes(input.styleAxes),
    extend: input.extend === true,
    transitionHint: stringValue(input.transitionHint, "transitionHint")
  };
}
function createWbGameVideoService(context) {
  const registry = createHostAssetRegistry(context);
  const generation = createHostGenerationOrchestrator(context, registry);
  return {
    async getGraph(value = {}) {
      assertSchema("getGraph", value);
      record(value);
      const [blueprint] = await Promise.all([
        context.files.read(BLUEPRINT_FILE),
        context.files.read(PROJECT_FILE)
      ]);
      return {
        project: parseGraph(blueprint),
        gameSlug: context.gameId
      };
    },
    async saveGraph(value) {
      assertSchema("saveGraph", value);
      const input = record(value);
      if (input.project === void 0) {
        return { ok: false, errors: ["\u7F3A\u5C11 project"] };
      }
      let project;
      try {
        project = normalizeDocument(input.project);
      } catch (error) {
        return { ok: false, errors: [error.message], gameSlug: context.gameId };
      }
      const errors = validateDocument(project);
      if (errors.length) return { ok: false, errors, gameSlug: context.gameId };
      await context.files.withLocks([GRAPH_SAVE_LOCK], async () => {
        await context.files.write(
          BLUEPRINT_FILE,
          encoder.encode(JSON.stringify(project, null, 2))
        );
        if (!await context.files.read(PROJECT_FILE)) {
          await context.files.write(
            PROJECT_FILE,
            encoder.encode(JSON.stringify(projectMetadata(context.gameId), null, 2))
          );
        }
      });
      return { ok: true, versions: [], gameSlug: context.gameId };
    },
    async listVideos(value) {
      assertSchema("listVideos", value);
      record(value);
      return {
        videos: NODIA_ASSETS_MANIFEST.assets.map((asset) => asset.id)
      };
    },
    async listAssets(value) {
      assertSchema("listAssets", value);
      const input = record(value);
      const filter = {};
      if (input.kind !== void 0) {
        if (!["image", "video", "audio"].includes(String(input.kind))) {
          throw new WbServiceInputError("kind is invalid");
        }
        filter.kind = input.kind;
      }
      if (input.productionType !== void 0) {
        if (![
          "character_ref",
          "scene_ref",
          "shot_image",
          "grid_storyboard",
          "video_clip"
        ].includes(String(input.productionType))) {
          throw new WbServiceInputError("productionType is invalid");
        }
        filter.productionType = input.productionType;
      }
      if (input.sceneNodeId !== void 0) {
        filter.sceneNodeId = stringValue(input.sceneNodeId, "sceneNodeId", true);
      }
      return { assets: await registry.list(filter) };
    },
    async getAsset(value) {
      const id = assertLogicalIdentifier(
        stringValue(value, "assetId", true),
        "assetId"
      );
      return { asset: await registry.get(id) };
    },
    async importCharacterRefs(value) {
      assertSchema("importCharacterRefs", value);
      const input = record(value);
      assertOnlyKeys(input, []);
      try {
        return { refs: await importCharacterRefsFromHost(context, registry) };
      } catch (error) {
        return { refs: [], error: publicErrorMessage(error) };
      }
    },
    async importSceneRefs(value) {
      assertSchema("importSceneRefs", value);
      const input = record(value);
      assertOnlyKeys(input, []);
      try {
        return { refs: await importSceneRefsFromHost(context, registry) };
      } catch (error) {
        return { refs: [], error: publicErrorMessage(error) };
      }
    },
    async generateShotScript(value) {
      assertSchema("generateShotScript", value);
      const input = shotScriptInput(value);
      try {
        return { shots: await generation.generateShotScript(input) };
      } catch (error) {
        return { shots: [], error: publicErrorMessage(error) };
      }
    },
    async generateKeyframe(value) {
      assertSchema("generateKeyframe", value);
      const input = keyframeInput(value);
      try {
        return { asset: await generation.generateKeyframe(input) };
      } catch (error) {
        return { asset: null, error: publicErrorMessage(error) };
      }
    },
    async generateVideo(value) {
      assertSchema("generateVideo", value);
      const input = videoInput(value, 60);
      try {
        return { asset: await generation.generateVideo(input) };
      } catch (error) {
        return { asset: null, error: publicErrorMessage(error) };
      }
    },
    async generateNodeVideo(value) {
      assertSchema("generateNodeVideo", value);
      const input = videoInput(value, 120);
      try {
        return { assets: await generation.generateNodeVideo(input) };
      } catch (error) {
        return { assets: [], error: publicErrorMessage(error) };
      }
    }
  };
}

// server/host/browser-media.ts
var encoder2 = new TextEncoder();
var decoder2 = new TextDecoder();
var BROWSER_MEDIA_INDEX_PATH = "assets/wb-game-video-media.json";
var UPLOAD_ROOT = "assets/.wb-game-video-uploads";
var UPLOAD_CHUNK_BYTES = 512 * 1024;
var MAX_UPLOAD_CHUNKS = 200;
var MAX_ACTIVE_UPLOADS = 16;
var MAX_ACTIVE_UPLOAD_BYTES = 256 * 1024 * 1024;
var UPLOAD_ID_PATTERN = /^[0-9a-f]{32}$/;
var UPLOAD_REFERENCE_PATTERN = /^workbench-upload:([0-9a-f]{32})$/;
var HOST_FILENAME_PREFIX = "wb-game-video-host-";
var RESOURCE_ID_PREFIX = "wb-game-video-resource-";
var UPLOAD_ALLOCATION_LOCK = "wb-game-video-browser-media-allocation";
var BROWSER_MEDIA_INDEX_LOCK = "wb-game-video-browser-media-index";
var MEDIA_POLICIES = {
  image: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"]
  },
  video: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["video/mp4"]
  },
  audio: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac"]
  },
  font: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ["font/woff2", "font/woff", "font/ttf", "font/otf"]
  }
};
var UploadConflictError = class extends Error {
};
function exactObject(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WbServiceInputError(`${label} must be an object`);
  }
  const record2 = value;
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record2)) {
    if (!allowedKeys.has(key)) {
      throw new WbServiceInputError(`${label} contains unsupported key: ${key}`);
    }
  }
  return record2;
}
function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new WbServiceInputError(`${label} must be a non-empty string`);
  }
  return value;
}
function safeFileName(value) {
  const name = nonEmptyString(value, "file_name");
  if (name.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(name) || name === "." || name === "..") {
    throw new WbServiceInputError("file_name is invalid");
  }
  return name;
}
function browserMediaType(value) {
  if (value === "audio" || value === "image" || value === "video" || value === "font") return value;
  throw new WbServiceInputError("x-workbench-media-type is invalid");
}
function mediaTypeForContentType(value) {
  for (const [type, policy] of Object.entries(MEDIA_POLICIES)) {
    if (policy.mimeTypes.includes(value)) return type;
  }
  throw new WbServiceInputError("mime_type is invalid");
}
function resource(record2, url) {
  return {
    resource_id: record2.resource_id,
    media_type: record2.media_type,
    name: record2.name,
    ...record2.type === void 0 ? {} : { type: record2.type },
    ...record2.remark === void 0 ? {} : { remark: record2.remark },
    ...record2.source === void 0 ? {} : { source: record2.source },
    ...record2.source_meta === void 0 ? {} : { source_meta: record2.source_meta },
    url,
    created_at: record2.created_at,
    updated_at: record2.updated_at
  };
}
function browserMediaRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid persisted browser media record");
  }
  const record2 = value;
  if (typeof record2.resource_id !== "string" || !record2.resource_id || record2.host_id !== void 0 && typeof record2.host_id !== "string" || record2.upload_id !== void 0 && !UPLOAD_ID_PATTERN.test(record2.upload_id) || record2.media_type !== "audio" && record2.media_type !== "image" && record2.media_type !== "video" && record2.media_type !== "font" || typeof record2.name !== "string" || record2.type !== void 0 && typeof record2.type !== "string" || record2.remark !== void 0 && typeof record2.remark !== "string" || record2.source !== void 0 && typeof record2.source !== "string" || record2.source_meta !== void 0 && (!record2.source_meta || typeof record2.source_meta !== "object" || Array.isArray(record2.source_meta)) || !Number.isSafeInteger(record2.created_at) || !Number.isSafeInteger(record2.updated_at) || typeof record2.deleted !== "boolean" || record2.reclaim_ids !== void 0 && (!Array.isArray(record2.reclaim_ids) || record2.reclaim_ids.some((id) => typeof id !== "string" || !id) || new Set(record2.reclaim_ids).size !== record2.reclaim_ids.length)) {
    throw new Error("Invalid persisted browser media record");
  }
  return record2;
}
async function readBrowserMedia(context) {
  const bytes = await context.files.read(BROWSER_MEDIA_INDEX_PATH);
  if (!bytes) return [];
  let value;
  try {
    value = JSON.parse(decoder2.decode(bytes));
  } catch {
    throw new Error("Invalid persisted browser media index");
  }
  if (!Array.isArray(value)) throw new Error("Invalid persisted browser media index");
  const records = value.map(browserMediaRecord);
  assertBrowserMediaIdentities(records);
  return records;
}
function assertBrowserMediaIdentities(records) {
  const resourceOwners = /* @__PURE__ */ new Map();
  const liveResourceOwners = /* @__PURE__ */ new Map();
  const hostOwners = /* @__PURE__ */ new Map();
  const liveHostOwners = /* @__PURE__ */ new Set();
  const uploadOwners = /* @__PURE__ */ new Set();
  for (const [index, record2] of records.entries()) {
    if (resourceOwners.has(record2.resource_id) || record2.upload_id !== void 0 && uploadOwners.has(record2.upload_id)) {
      throw new Error("Invalid persisted browser media index");
    }
    resourceOwners.set(record2.resource_id, index);
    if (!record2.deleted) {
      const hostId = hostMediaId(record2);
      if (hostOwners.has(hostId)) {
        throw new Error("Invalid persisted browser media index");
      }
      liveResourceOwners.set(record2.resource_id, index);
      hostOwners.set(hostId, index);
      liveHostOwners.add(hostId);
    }
    if (record2.upload_id !== void 0) uploadOwners.add(record2.upload_id);
  }
  for (const [resourceId, resourceOwner] of liveResourceOwners) {
    const hostOwner = hostOwners.get(resourceId);
    if (hostOwner !== void 0 && hostOwner !== resourceOwner) {
      throw new Error("Invalid persisted browser media index");
    }
  }
  for (const record2 of records) {
    if (record2.reclaim_ids?.some((assetId) => liveHostOwners.has(assetId))) {
      throw new Error("Invalid persisted browser media index");
    }
  }
}
async function writeBrowserMedia(context, records) {
  assertBrowserMediaIdentities(records);
  await context.files.write(BROWSER_MEDIA_INDEX_PATH, encoder2.encode(JSON.stringify(records)));
}
async function browserMediaLocators(context) {
  return new Map((await context.media.list(context.gameId)).map((asset) => [asset.id, asset.url]));
}
function hostMediaId(record2) {
  return record2.host_id ?? record2.resource_id;
}
function appendReclaims(record2, ids) {
  const currentHostId = record2.deleted ? void 0 : hostMediaId(record2);
  const reclaimIds = new Set(record2.reclaim_ids ?? []);
  for (const id of ids) {
    if (id && id !== currentHostId) reclaimIds.add(id);
  }
  if (reclaimIds.size > 0) record2.reclaim_ids = [...reclaimIds].sort();
  else delete record2.reclaim_ids;
}
async function reclaimPendingMedia(context, records, record2) {
  const pending = record2.reclaim_ids ?? [];
  if (pending.length === 0) return;
  const hostedAssets = new Map(
    (await context.media.list(context.gameId)).map((asset) => [asset.id, asset])
  );
  const reclaimedCurrentHost = record2.deleted && record2.host_id !== void 0 && pending.includes(record2.host_id);
  for (const assetId of pending) {
    const hosted = hostedAssets.get(assetId);
    if (hosted && hosted.metadata?.source !== "wb-game-video-browser") {
      throw new Error("Refusing to reclaim media not owned by wb-game-video");
    }
    await context.media.delete(context.gameId, assetId);
  }
  delete record2.reclaim_ids;
  if (reclaimedCurrentHost) delete record2.host_id;
  await writeBrowserMedia(context, records);
}
function hostFilename(uploadId) {
  return `${HOST_FILENAME_PREFIX}${uploadId}`;
}
function uniqueResourceId(records) {
  let id;
  do {
    id = `${RESOURCE_ID_PREFIX}${randomUUID().replaceAll("-", "")}`;
  } while (records.some((record2) => record2.resource_id === id || !record2.deleted && hostMediaId(record2) === id));
  return id;
}
function uniqueUploadId(records) {
  let id;
  do {
    id = randomUUID().replaceAll("-", "");
  } while (records.some((record2) => record2.upload_id === id));
  return id;
}
function framedSha256(parts) {
  const hash = createHash2("sha256");
  for (const part of parts) {
    const bytes = typeof part === "string" ? encoder2.encode(part) : part;
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
  }
  return hash.digest("hex");
}
function uploadSessionPath(id) {
  return `${UPLOAD_ROOT}/slots/${uploadSlot(id)}/session.json`;
}
function uploadChunkPath(id, index) {
  return `${UPLOAD_ROOT}/slots/${uploadSlot(id)}/chunks/${index}.bin`;
}
function uploadSlot(id) {
  if (!UPLOAD_ID_PATTERN.test(id)) throw new WbServiceInputError("Upload id is invalid");
  return Number.parseInt(id.slice(0, 2), 16) % MAX_ACTIVE_UPLOADS;
}
async function readUploadSlot(context, slot) {
  const bytes = await context.files.read(`${UPLOAD_ROOT}/slots/${slot}/session.json`);
  if (!bytes) return null;
  let value;
  try {
    value = JSON.parse(decoder2.decode(bytes));
  } catch {
    throw new Error("Invalid persisted upload session");
  }
  const id = value?.id;
  if (typeof id !== "string") throw new Error("Invalid persisted upload session");
  return uploadSession(value, id);
}
function withUploadSlotLock(context, slot, operation) {
  return context.files.withLocks(
    [`wb-game-video-browser-media-slot-${slot}`],
    operation
  );
}
function withUploadAllocationLock(context, operation) {
  return context.files.withLocks([UPLOAD_ALLOCATION_LOCK], operation);
}
async function withBrowserIndexLock(context, operation) {
  return context.files.withLocks([BROWSER_MEDIA_INDEX_LOCK], operation);
}
function uploadSession(value, expectedId) {
  const session = exactObject(value, [
    "version",
    "id",
    "fileName",
    "mediaType",
    "contentType",
    "totalSize",
    "chunkSize",
    "chunkCount",
    "createdAt",
    "expiresAt",
    "clientResourceId",
    "replaceExisting",
    "nextIndex",
    "status",
    "resourceId"
  ], "upload session");
  if (session.version !== 1 || session.id !== expectedId || !UPLOAD_ID_PATTERN.test(expectedId) || typeof session.fileName !== "string" || browserMediaType(session.mediaType) !== session.mediaType || typeof session.contentType !== "string" || !MEDIA_POLICIES[session.mediaType].mimeTypes.includes(session.contentType) || !Number.isSafeInteger(session.totalSize) || session.totalSize <= 0 || session.totalSize > MEDIA_POLICIES[session.mediaType].maxBytes || session.chunkSize !== UPLOAD_CHUNK_BYTES || !Number.isSafeInteger(session.chunkCount) || session.chunkCount <= 0 || session.chunkCount > MAX_UPLOAD_CHUNKS || session.chunkCount !== Math.ceil(session.totalSize / session.chunkSize) || !Number.isSafeInteger(session.createdAt) || !Number.isSafeInteger(session.expiresAt) || session.clientResourceId !== void 0 && typeof session.clientResourceId !== "string" || session.replaceExisting !== void 0 && typeof session.replaceExisting !== "boolean" || !Number.isSafeInteger(session.nextIndex) || session.nextIndex < 0 || session.nextIndex > session.chunkCount || session.status !== "open" && session.status !== "finalizing" && session.status !== "finalized" && session.status !== "expired" || session.resourceId !== void 0 && typeof session.resourceId !== "string" || session.status === "finalizing" && (!session.resourceId || session.nextIndex !== session.chunkCount)) {
    throw new Error("Invalid persisted upload session");
  }
  return session;
}
async function readUploadSession(context, id) {
  if (!UPLOAD_ID_PATTERN.test(id)) return null;
  const bytes = await context.files.read(uploadSessionPath(id));
  if (!bytes) return null;
  try {
    const value = JSON.parse(decoder2.decode(bytes));
    if (value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && value.id !== id) {
      return null;
    }
    return uploadSession(value, id);
  } catch (error) {
    if (error instanceof WbServiceInputError) throw new Error("Invalid persisted upload session");
    throw error;
  }
}
async function writeUploadSession(context, session) {
  await context.files.write(uploadSessionPath(session.id), encoder2.encode(JSON.stringify(session)));
}
async function clearUploadChunks(context, session) {
  for (let index = 0; index < session.chunkCount; index += 1) {
    await context.files.write(uploadChunkPath(session.id, index), new Uint8Array());
  }
}
async function requireActiveUploadSession(context, session) {
  if (session.status === "expired" || session.status === "open" && Date.now() >= session.expiresAt) {
    await clearUploadChunks(context, session);
    if (session.status !== "expired") {
      session.status = "expired";
      await writeUploadSession(context, session);
    }
    throw new UploadConflictError("Upload session is expired");
  }
}
async function cleanupExpiredUploads(context) {
  for (let slot = 0; slot < MAX_ACTIVE_UPLOADS; slot += 1) {
    await withUploadSlotLock(context, slot, async () => {
      const session = await readUploadSlot(context, slot);
      if (!session) return;
      if (session.status === "finalized" || session.status === "expired") {
        return;
      }
      if (session.status === "finalizing") {
        const committed = await withBrowserIndexLock(context, async () => {
          const records = await readBrowserMedia(context);
          const record2 = records.find((record3) => !record3.deleted && record3.resource_id === session.resourceId && record3.upload_id === session.id);
          if (!record2) return false;
          await reclaimPendingMedia(context, records, record2);
          return true;
        });
        if (committed) {
          await clearUploadChunks(context, session);
          session.status = "finalized";
          await writeUploadSession(context, session);
          return;
        }
        return;
      }
      if (Date.now() < session.expiresAt) return;
      try {
        await requireActiveUploadSession(context, session);
      } catch (error) {
        if (!(error instanceof UploadConflictError)) throw error;
      }
    });
  }
}
async function activeUploadUsage(context) {
  let count = 0;
  let bytes = 0;
  for (let slot = 0; slot < MAX_ACTIVE_UPLOADS; slot += 1) {
    const session = await withUploadSlotLock(
      context,
      slot,
      () => readUploadSlot(context, slot)
    );
    if (!session || session.status !== "open" && session.status !== "finalizing") continue;
    if (session.status === "open" && Date.now() >= session.expiresAt) continue;
    count += 1;
    bytes += session.totalSize;
  }
  return { count, bytes };
}
function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
function kinoCreateInput(value) {
  const input = exactObject(value, [
    "media_type",
    "url",
    "name",
    "type",
    "remark",
    "source",
    "source_meta"
  ], "resource");
  const mediaType = browserMediaType(
    typeof input.media_type === "string" ? input.media_type : void 0
  );
  const url = nonEmptyString(input.url, "url");
  for (const key of ["name", "type", "remark", "source"]) {
    if (input[key] !== void 0 && typeof input[key] !== "string") {
      throw new WbServiceInputError(`${key} must be a string`);
    }
  }
  if (input.source_meta !== void 0 && (!input.source_meta || typeof input.source_meta !== "object" || Array.isArray(input.source_meta))) {
    throw new WbServiceInputError("source_meta must be an object");
  }
  return {
    media_type: mediaType,
    url,
    ...input.name === void 0 ? {} : { name: input.name },
    ...input.type === void 0 ? {} : { type: input.type },
    ...input.remark === void 0 ? {} : { remark: input.remark },
    ...input.source === void 0 ? {} : { source: input.source },
    ...input.source_meta === void 0 ? {} : {
      source_meta: input.source_meta
    }
  };
}
async function finalizeBrowserUpload(context, input) {
  const match = UPLOAD_REFERENCE_PATTERN.exec(input.url);
  if (!match) throw new WbServiceInputError("url is not a prepared workbench upload");
  const id = match[1];
  return withUploadSlotLock(context, uploadSlot(id), async () => {
    const session = await readUploadSession(context, id);
    if (!session) throw new WbServiceInputError("Prepared upload was not found");
    await requireActiveUploadSession(context, session);
    if (session.mediaType !== input.media_type) {
      throw new WbServiceInputError("media_type does not match the prepared upload");
    }
    if (session.status === "finalized") {
      if (!session.resourceId) throw new Error("Invalid finalized upload session");
      await clearUploadChunks(context, session);
      return withBrowserIndexLock(context, async () => {
        const records = await readBrowserMedia(context);
        const record2 = records.find((item) => item.resource_id === session.resourceId && !item.deleted);
        if (!record2) throw new Error("Finalized upload resource is unavailable");
        await reclaimPendingMedia(context, records, record2);
        const locator = (await browserMediaLocators(context)).get(hostMediaId(record2));
        if (!locator) throw new Error("Finalized upload resource is unavailable");
        return resource(record2, locator);
      });
    }
    if (session.nextIndex !== session.chunkCount) {
      throw new WbServiceInputError("Prepared upload is incomplete");
    }
    return withBrowserIndexLock(context, async () => {
      const records = await readBrowserMedia(context);
      const committed = session.status === "finalizing" && session.resourceId ? records.find((record3) => !record3.deleted && record3.resource_id === session.resourceId && record3.upload_id === session.id) : void 0;
      if (committed) {
        await reclaimPendingMedia(context, records, committed);
        await clearUploadChunks(context, session);
        session.status = "finalized";
        await writeUploadSession(context, session);
        const locator = (await browserMediaLocators(context)).get(hostMediaId(committed));
        if (!locator) throw new Error("Finalized upload resource is unavailable");
        return resource(committed, locator);
      }
      const replacementIndex = session.replaceExisting && session.clientResourceId ? records.findIndex((item) => item.resource_id === session.clientResourceId && !item.deleted && item.media_type === session.mediaType) : -1;
      if (session.replaceExisting && replacementIndex < 0) {
        throw new WbServiceInputError("Replacement resource was not found");
      }
      const current = replacementIndex >= 0 ? records[replacementIndex] : void 0;
      const resourceId = session.resourceId ?? current?.resource_id ?? uniqueResourceId(records);
      if (records.some(
        (record3, index) => index !== replacementIndex && (record3.resource_id === resourceId || !record3.deleted && hostMediaId(record3) === resourceId)
      )) {
        throw new Error("Browser resource id aliases another host media id");
      }
      if (session.status === "open") {
        session.resourceId = resourceId;
        session.status = "finalizing";
        await writeUploadSession(context, session);
      }
      const combined = new Uint8Array(session.totalSize);
      let offset = 0;
      for (let index = 0; index < session.chunkCount; index += 1) {
        const chunk = await context.files.read(uploadChunkPath(id, index));
        const expected = index === session.chunkCount - 1 ? session.totalSize - session.chunkSize * index : session.chunkSize;
        if (!chunk || chunk.byteLength !== expected) {
          throw new WbServiceInputError("Prepared upload is incomplete");
        }
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (offset !== session.totalSize) {
        throw new WbServiceInputError("Prepared upload is incomplete");
      }
      const hosted = await context.media.put(context.gameId, {
        filename: hostFilename(session.id),
        contentType: session.contentType,
        bytes: combined,
        idempotencyKey: `wb-game-video:browser-upload:${session.id}`,
        metadata: { source: "wb-game-video-browser", uploadId: session.id }
      });
      const now = Date.now();
      const record2 = {
        resource_id: resourceId,
        host_id: hosted.id,
        upload_id: session.id,
        media_type: session.mediaType,
        name: input.name ?? session.fileName,
        ...input.type === void 0 ? {} : { type: input.type },
        ...input.remark === void 0 ? {} : { remark: input.remark },
        ...input.source === void 0 ? {} : { source: input.source },
        source_meta: {
          ...input.source_meta ?? {},
          mime_type: session.contentType,
          extra: {
            ...input.source_meta?.extra && typeof input.source_meta.extra === "object" && !Array.isArray(input.source_meta.extra) ? input.source_meta.extra : {},
            bytes: session.totalSize
          }
        },
        created_at: current?.created_at ?? now,
        updated_at: now,
        deleted: false
      };
      if (current) {
        appendReclaims(record2, [
          ...current.reclaim_ids ?? [],
          hostMediaId(current)
        ]);
      }
      if (records.some(
        (item, index) => index !== replacementIndex && (item.resource_id === record2.resource_id || !item.deleted && (hostMediaId(item) === record2.resource_id || item.resource_id === hosted.id || hostMediaId(item) === hosted.id))
      )) {
        throw new Error("Host media id already exists in the browser media index");
      }
      if (replacementIndex >= 0) records[replacementIndex] = record2;
      else records.push(record2);
      await writeBrowserMedia(context, records);
      await reclaimPendingMedia(context, records, record2);
      await clearUploadChunks(context, session);
      session.status = "finalized";
      await writeUploadSession(context, session);
      return resource(record2, hosted.url);
    });
  });
}
function createBrowserMediaService(context) {
  return {
    async list(type, resourceType) {
      const locators = await browserMediaLocators(context);
      return (await readBrowserMedia(context)).filter(
        (record2) => !record2.deleted && (!type || record2.media_type === type) && (!resourceType || record2.type === resourceType)
      ).flatMap((record2) => {
        const locator = locators.get(hostMediaId(record2));
        return locator ? [resource(record2, locator)] : [];
      });
    },
    async prepareUpload(value) {
      const input = exactObject(value, [
        "file_name",
        "mime_type",
        "bytes",
        "extension",
        "client_resource_id",
        "replace_existing"
      ], "upload preparation");
      const fileName = safeFileName(input.file_name);
      const contentType = nonEmptyString(input.mime_type, "mime_type");
      const mediaType = mediaTypeForContentType(contentType);
      const totalSize = input.bytes;
      if (!Number.isSafeInteger(totalSize) || totalSize <= 0 || totalSize > MEDIA_POLICIES[mediaType].maxBytes) {
        throw new WbServiceInputError("bytes exceeds the media upload limit");
      }
      if (input.extension !== void 0 && (typeof input.extension !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(input.extension))) {
        throw new WbServiceInputError("extension is invalid");
      }
      if (input.client_resource_id !== void 0 && (typeof input.client_resource_id !== "string" || !input.client_resource_id)) {
        throw new WbServiceInputError("client_resource_id is invalid");
      }
      if (input.replace_existing !== void 0 && typeof input.replace_existing !== "boolean") {
        throw new WbServiceInputError("replace_existing is invalid");
      }
      if (input.replace_existing === true && input.client_resource_id === void 0) {
        throw new WbServiceInputError("replace_existing requires client_resource_id");
      }
      if (input.client_resource_id !== void 0 && input.replace_existing !== true) {
        throw new WbServiceInputError("client_resource_id requires replace_existing");
      }
      const chunkCount = Math.ceil(totalSize / UPLOAD_CHUNK_BYTES);
      if (chunkCount <= 0 || chunkCount > MAX_UPLOAD_CHUNKS) {
        throw new WbServiceInputError("bytes requires too many upload chunks");
      }
      return withUploadAllocationLock(context, async () => {
        await cleanupExpiredUploads(context);
        const usage = await activeUploadUsage(context);
        if (usage.count >= MAX_ACTIVE_UPLOADS || usage.bytes + totalSize > MAX_ACTIVE_UPLOAD_BYTES) {
          throw new WbServiceInputError("Too many active uploads for this game");
        }
        for (let slot = 0; slot < MAX_ACTIVE_UPLOADS; slot += 1) {
          const prepared = await withUploadSlotLock(context, slot, async () => {
            const occupant = await readUploadSlot(context, slot);
            if (occupant && occupant.status !== "finalized" && occupant.status !== "expired") {
              return null;
            }
            return withBrowserIndexLock(context, async () => {
              const records = await readBrowserMedia(context);
              if (input.replace_existing === true) {
                const existing = records.find((item) => item.resource_id === input.client_resource_id && !item.deleted);
                if (!existing || existing.media_type !== mediaType) {
                  throw new WbServiceInputError("Replacement resource was not found");
                }
              }
              let id;
              do {
                id = uniqueUploadId(records);
              } while (uploadSlot(id) !== slot);
              const now = Date.now();
              const expiresAt = now + 60 * 60 * 1e3;
              const session = {
                version: 1,
                id,
                fileName,
                mediaType,
                contentType,
                totalSize,
                chunkSize: UPLOAD_CHUNK_BYTES,
                chunkCount,
                createdAt: now,
                expiresAt,
                ...input.client_resource_id === void 0 ? {} : {
                  clientResourceId: input.client_resource_id,
                  replaceExisting: true
                },
                nextIndex: 0,
                status: "open"
              };
              await writeUploadSession(context, session);
              return {
                upload: {
                  method: "PUT",
                  url: `media/uploads/${id}`,
                  headers: { "content-type": contentType },
                  expires_at: new Date(expiresAt).toISOString(),
                  chunk_size: UPLOAD_CHUNK_BYTES,
                  chunk_count: chunkCount
                },
                object_url: `workbench-upload:${id}`,
                upload_token: id
              };
            });
          });
          if (prepared) return prepared;
        }
        throw new WbServiceInputError("Too many active uploads for this game");
      });
    },
    async putChunk(id, chunkIndex, chunkCount, contentType, body) {
      return withUploadSlotLock(context, uploadSlot(id), async () => {
        const session = await readUploadSession(context, id);
        if (!session) return "missing";
        await requireActiveUploadSession(context, session);
        if (session.status !== "open") throw new UploadConflictError("Upload session is finalized");
        if (chunkCount !== session.chunkCount) {
          throw new WbServiceInputError("chunk_count does not match the upload session");
        }
        if (chunkIndex >= session.chunkCount) {
          throw new WbServiceInputError("chunk_index exceeds the upload session");
        }
        if (contentType !== session.contentType) {
          throw new WbServiceInputError("Chunk content type does not match the upload session");
        }
        const expectedSize = chunkIndex === session.chunkCount - 1 ? session.totalSize - session.chunkSize * chunkIndex : session.chunkSize;
        if (body.byteLength !== expectedSize || body.byteLength >= 1024 * 1024) {
          throw new WbServiceInputError("Chunk size does not match the upload session");
        }
        if (chunkIndex < session.nextIndex) {
          const existing = await context.files.read(uploadChunkPath(id, chunkIndex));
          if (existing && bytesEqual(existing, body)) return "duplicate";
          throw new UploadConflictError("Upload chunk conflicts with persisted bytes");
        }
        if (chunkIndex > session.nextIndex) {
          throw new WbServiceInputError("Upload chunks must be sent in order");
        }
        await context.files.write(uploadChunkPath(id, chunkIndex), body);
        session.nextIndex += 1;
        await writeUploadSession(context, session);
        return "written";
      });
    },
    async create(value) {
      return finalizeBrowserUpload(context, kinoCreateInput(value));
    },
    async batch(value) {
      const input = exactObject(value, ["resources"], "resource batch");
      if (!Array.isArray(input.resources) || input.resources.length === 0 || input.resources.length > 100) {
        throw new WbServiceInputError("resources must contain between 1 and 100 items");
      }
      const items = [];
      let skippedCount = 0;
      const seenUploads = /* @__PURE__ */ new Set();
      for (const value2 of input.resources) {
        const resourceInput = kinoCreateInput({
          ...exactObject(value2, [
            "media_type",
            "url",
            "name",
            "type",
            "remark",
            "source",
            "source_meta"
          ], "batch resource")
        });
        if (seenUploads.has(resourceInput.url)) {
          skippedCount += 1;
          continue;
        }
        seenUploads.add(resourceInput.url);
        items.push(await finalizeBrowserUpload(context, resourceInput));
      }
      return { created_count: items.length, skipped_count: skippedCount, items };
    },
    async directUpload(name, type, contentType, body, idempotencyKey) {
      const fileName = safeFileName(name);
      if (!idempotencyKey || idempotencyKey.length > 200 || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) {
        throw new WbServiceInputError("A valid x-workbench-idempotency-key is required");
      }
      if (!MEDIA_POLICIES[type].mimeTypes.includes(contentType) || body.byteLength <= 0 || body.byteLength > MEDIA_POLICIES[type].maxBytes) {
        throw new WbServiceInputError("Media upload does not match its declared type");
      }
      return withBrowserIndexLock(context, async () => {
        const records = await readBrowserMedia(context);
        const durableKey = framedSha256(["caller-key", idempotencyKey]);
        const uploadId = durableKey.slice(0, 32);
        if (records.some((record3) => record3.deleted && record3.upload_id === uploadId)) {
          throw new WbServiceInputError(
            "x-workbench-idempotency-key belongs to a deleted resource"
          );
        }
        const resourceId = uniqueResourceId(records);
        const hosted = await context.media.put(context.gameId, {
          filename: hostFilename(uploadId),
          contentType,
          bytes: body,
          idempotencyKey: `wb-game-video:browser-direct:${durableKey}`,
          metadata: {
            source: "wb-game-video-browser",
            uploadId,
            originalName: fileName,
            mediaType: type
          }
        });
        const committed = records.find((item) => !item.deleted && item.upload_id === uploadId);
        if (committed) {
          if (hostMediaId(committed) !== hosted.id) {
            throw new Error("Direct upload receipt conflicts with browser media index");
          }
          return resource(committed, hosted.url);
        }
        const now = Date.now();
        const record2 = {
          resource_id: resourceId,
          host_id: hosted.id,
          upload_id: uploadId,
          media_type: type,
          name: fileName,
          created_at: now,
          updated_at: now,
          deleted: false
        };
        if (records.some(
          (item) => item.resource_id === record2.resource_id || !item.deleted && (hostMediaId(item) === record2.resource_id || item.resource_id === hosted.id || hostMediaId(item) === hosted.id)
        )) {
          throw new Error("Host media id already exists in the browser media index");
        }
        await writeBrowserMedia(context, [...records, record2]);
        return resource(record2, hosted.url);
      });
    },
    async get(id) {
      const record2 = (await readBrowserMedia(context)).find((item) => item.resource_id === id && !item.deleted);
      if (!record2) return null;
      const locator = (await browserMediaLocators(context)).get(hostMediaId(record2));
      return locator ? resource(record2, locator) : null;
    },
    async update(id, value) {
      return withBrowserIndexLock(context, async () => {
        const records = await readBrowserMedia(context);
        const index = records.findIndex((item) => item.resource_id === id);
        const record2 = index < 0 ? void 0 : records[index];
        if (!record2 || record2.deleted) return null;
        const input = exactObject(value, [
          "resource_id",
          "media_type",
          "url",
          "name",
          "type",
          "remark",
          "source",
          "source_meta"
        ], "resource update");
        if (typeof input.name !== "string") {
          throw new WbServiceInputError("Media rename requires name");
        }
        if (input.resource_id !== void 0 && input.resource_id !== record2.resource_id) {
          throw new WbServiceInputError("resource_id does not match the route");
        }
        if (input.media_type !== void 0 && input.media_type !== record2.media_type) {
          throw new WbServiceInputError("media_type cannot be changed");
        }
        if (input.source_meta !== void 0 && (!input.source_meta || typeof input.source_meta !== "object" || Array.isArray(input.source_meta))) {
          throw new WbServiceInputError("source_meta must be an object");
        }
        for (const key of ["type", "remark", "source"]) {
          if (input[key] !== void 0 && typeof input[key] !== "string") {
            throw new WbServiceInputError(`${key} must be a string`);
          }
        }
        record2.name = input.name;
        if (input.type !== void 0) record2.type = input.type;
        if (input.remark !== void 0) record2.remark = input.remark;
        if (input.source !== void 0) record2.source = input.source;
        if (input.source_meta !== void 0) {
          record2.source_meta = input.source_meta;
        }
        record2.updated_at = Date.now();
        records[index] = record2;
        await writeBrowserMedia(context, records);
        const locator = (await browserMediaLocators(context)).get(hostMediaId(record2));
        return locator ? resource(record2, locator) : null;
      });
    },
    async remove(id) {
      return withBrowserIndexLock(context, async () => {
        const records = await readBrowserMedia(context);
        const index = records.findIndex((item) => item.resource_id === id);
        const record2 = index < 0 ? void 0 : records[index];
        if (!record2) return false;
        if (!record2.deleted) {
          record2.deleted = true;
          appendReclaims(record2, [hostMediaId(record2)]);
          records[index] = record2;
          await writeBrowserMedia(context, records);
        }
        await reclaimPendingMedia(context, records, record2);
        return true;
      });
    },
    async content(id) {
      const record2 = (await readBrowserMedia(context)).find((item) => item.resource_id === id && !item.deleted);
      if (!record2) return null;
      return context.media.read(context.gameId, hostMediaId(record2));
    }
  };
}

// server/host/media-routes.ts
import { open, readFile, readdir, stat } from "fs/promises";
import { fileURLToPath as fileURLToPath2 } from "url";
var EMPTY = new Uint8Array();
function notFound() {
  return {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "content-length": "0"
    },
    body: EMPTY
  };
}
function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function resolveBundledAsset(id, key) {
  const source = new URL(`../../src/editor/assets/${key}`, import.meta.url);
  try {
    if ((await stat(source)).isFile()) return source;
  } catch {
  }
  const assetsDirectory = new URL("../assets/", import.meta.url);
  let entries;
  try {
    entries = await readdir(assetsDirectory);
  } catch {
    return null;
  }
  const matcher = new RegExp(`^${escaped(id)}(?:-[A-Za-z0-9_-]+)?\\.mp4$`);
  const matches = entries.filter((entry) => matcher.test(entry)).sort();
  if (matches.length !== 1) return null;
  try {
    const resolved = new URL(matches[0], assetsDirectory);
    return (await stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}
function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || !match[1] && !match[2] || size <= 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}
function rangeNotSatisfiable(size) {
  return {
    status: 416,
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "content-length": "0",
      "content-range": `bytes */${size}`
    },
    body: EMPTY
  };
}
async function bundledMediaResponse(rawId, rangeHeader, options = {}) {
  let id;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return notFound();
  }
  if (!id || id === "." || id === ".." || id.includes("/") || id.includes("\\")) {
    return notFound();
  }
  const asset = NODIA_ASSETS_MANIFEST.assets.find((entry) => entry.id === id);
  if (!asset) return notFound();
  const key = asset.file.key.replace(/\\/g, "/");
  if (key.startsWith("/") || key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return notFound();
  }
  fileURLToPath2(new URL(`../../src/editor/assets/${key}`, import.meta.url));
  const location = await (options.resolveAsset ?? resolveBundledAsset)(id, key);
  if (!location) return notFound();
  let size;
  try {
    size = (await stat(location)).size;
  } catch {
    return notFound();
  }
  const baseHeaders = {
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": asset.file.mime
  };
  if (rangeHeader !== void 0) {
    const range = parseRange(rangeHeader, size);
    if (!range) return rangeNotSatisfiable(size);
    const body = new Uint8Array(range.end - range.start + 1);
    const handle = await open(location, "r");
    try {
      const result = await handle.read(body, 0, body.byteLength, range.start);
      if (result.bytesRead !== body.byteLength) return rangeNotSatisfiable(size);
    } finally {
      await handle.close();
    }
    return {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-length": String(body.byteLength),
        "content-range": `bytes ${range.start}-${range.end}/${size}`
      },
      body
    };
  }
  const bytes = new Uint8Array(await readFile(location));
  return {
    status: 200,
    headers: {
      ...baseHeaders,
      "content-length": String(bytes.byteLength)
    },
    body: bytes
  };
}

// server/host/router.ts
var encoder3 = new TextEncoder();
var decoder3 = new TextDecoder();
function jsonResponse(status, value) {
  const body = encoder3.encode(JSON.stringify(value));
  return {
    status,
    headers: {
      "cache-control": "no-store",
      "content-length": String(body.byteLength),
      "content-type": "application/json; charset=utf-8"
    },
    body
  };
}
function mediaResponse(value) {
  return jsonResponse(200, { code: 0, message: "ok", data: value });
}
function singleByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || !match[1] && !match[2] || size <= 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}
function rangedBinaryResponse(contentType, bytes, rangeHeader, head) {
  const baseHeaders = {
    "accept-ranges": "bytes",
    "content-type": contentType
  };
  if (rangeHeader === void 0) {
    return {
      status: 200,
      headers: {
        ...baseHeaders,
        "content-length": String(bytes.byteLength)
      },
      body: head ? new Uint8Array() : bytes
    };
  }
  const range = singleByteRange(rangeHeader, bytes.byteLength);
  if (!range) {
    const response = jsonResponse(416, {
      ok: false,
      error: {
        code: "range_not_satisfiable",
        target: "wb-game-video",
        message: "Range Not Satisfiable",
        retryable: false
      }
    });
    return {
      ...response,
      headers: {
        ...response.headers,
        "accept-ranges": "bytes",
        "content-range": `bytes */${bytes.byteLength}`
      },
      body: head ? new Uint8Array() : response.body
    };
  }
  const body = bytes.slice(range.start, range.end + 1);
  return {
    status: 206,
    headers: {
      ...baseHeaders,
      "content-length": String(body.byteLength),
      "content-range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`
    },
    body: head ? new Uint8Array() : body
  };
}
function notFound2() {
  return jsonResponse(404, {
    ok: false,
    error: {
      code: "not_found",
      target: "wb-game-video",
      message: "Not Found",
      retryable: false
    }
  });
}
function header(request, name) {
  const target = name.toLowerCase();
  for (const [key, values] of Object.entries(request.headers)) {
    if (key.toLowerCase() === target) return values[0];
  }
  return void 0;
}
function pathParts(rawPath) {
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  if (!path) return [];
  const parts = [];
  for (const rawPart of path.split("/")) {
    let part;
    try {
      part = decodeURIComponent(rawPart);
    } catch {
      return null;
    }
    if (!part || part === "." || part === ".." || part.includes("/") || part.includes("\\")) {
      return null;
    }
    parts.push(part);
  }
  return parts;
}
function jsonBody(request) {
  if (request.body.byteLength === 0) return {};
  const contentType = header(request, "content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new WbServiceInputError("Request body must be application/json");
  }
  try {
    return JSON.parse(decoder3.decode(request.body));
  } catch {
    throw new WbServiceInputError("Request body is invalid JSON");
  }
}
function exactQuery(query, allowed) {
  const allowedKeys = new Set(allowed);
  const result = {};
  for (const [name, values] of Object.entries(query)) {
    if (!allowedKeys.has(name)) {
      throw new WbServiceInputError(`Query contains unsupported key: ${name}`);
    }
    if (values.length !== 1 || values[0] === void 0) {
      throw new WbServiceInputError(`Query key must have exactly one value: ${name}`);
    }
    result[name] = values[0];
  }
  return result;
}
function parsePositiveInteger(value, label, allowZero = false) {
  if (value === void 0 || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new WbServiceInputError(`${label} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed < 1)) {
    throw new WbServiceInputError(`${label} is invalid`);
  }
  return parsed;
}
var POST_ROUTES = /* @__PURE__ */ new Map([
  ["references/characters/import", "importCharacterRefs"],
  ["references/scenes/import", "importSceneRefs"],
  ["generation/shot-script", "generateShotScript"],
  ["generation/keyframe", "generateKeyframe"],
  ["generation/video", "generateVideo"],
  ["generation/node-video", "generateNodeVideo"]
]);
function createWbGameVideoRouter(context, options = {}) {
  const service = createWbGameVideoService(context);
  const browserMedia = createBrowserMediaService(context);
  return {
    async handle(request) {
      try {
        const parts = pathParts(request.path);
        if (!parts) return notFound2();
        const method = request.method.toUpperCase();
        const path = parts.join("/");
        if (method === "POST" && path === "media/image-assets/upload") {
          exactQuery(request.query, []);
          return mediaResponse(await browserMedia.prepareUpload(jsonBody(request)));
        }
        if (method === "PUT" && parts.length === 3 && parts[0] === "media" && parts[1] === "uploads") {
          const query = exactQuery(request.query, ["chunk_index", "chunk_count"]);
          const chunkIndex = parsePositiveInteger(query.chunk_index, "chunk_index", true);
          const chunkCount = parsePositiveInteger(query.chunk_count, "chunk_count");
          const result = await browserMedia.putChunk(
            parts[2],
            chunkIndex,
            chunkCount,
            header(request, "content-type"),
            request.body
          );
          if (result === "missing") return notFound2();
          return { status: 204, headers: { "content-length": "0" }, body: new Uint8Array() };
        }
        if (method === "GET" && path === "media/resources") {
          const query = exactQuery(request.query, ["media_type", "page", "page_size", "type"]);
          const type = query.media_type === void 0 ? void 0 : browserMediaType(query.media_type);
          const items = await browserMedia.list(type, query.type);
          const page = query.page === void 0 ? 1 : Number(query.page);
          const pageSize = query.page_size === void 0 ? Math.min(100, Math.max(1, items.length)) : Number(query.page_size);
          if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
            throw new WbServiceInputError("page must be positive and page_size must be between 1 and 100");
          }
          const offset = (page - 1) * pageSize;
          return mediaResponse({ items: items.slice(offset, offset + pageSize), total: items.length, page, page_size: pageSize });
        }
        if (method === "POST" && path === "media/resources") {
          exactQuery(request.query, []);
          const requestContentType = header(request, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
          if (requestContentType === "application/json") {
            return mediaResponse(await browserMedia.create(jsonBody(request)));
          }
          const name = header(request, "x-workbench-media-name");
          const type = browserMediaType(header(request, "x-workbench-media-type"));
          const contentType = header(request, "content-type");
          if (!name || !contentType || request.body.byteLength === 0) {
            throw new WbServiceInputError("Media upload requires name, type, content type, and body");
          }
          return mediaResponse(await browserMedia.directUpload(
            name,
            type,
            contentType,
            request.body,
            header(request, "x-workbench-idempotency-key")
          ));
        }
        if (method === "POST" && path === "media/resources/batch") {
          exactQuery(request.query, []);
          return mediaResponse(await browserMedia.batch(jsonBody(request)));
        }
        if (parts.length === 3 && parts[0] === "media" && parts[1] === "resources") {
          const id = parts[2];
          if (method === "GET") {
            exactQuery(request.query, []);
            const value = await browserMedia.get(id);
            return value ? mediaResponse(value) : notFound2();
          }
          if (method === "PUT") {
            exactQuery(request.query, []);
            const value = await browserMedia.update(id, jsonBody(request));
            return value ? mediaResponse(value) : notFound2();
          }
          if (method === "DELETE") {
            exactQuery(request.query, []);
            if (!await browserMedia.remove(id)) return notFound2();
            return { status: 204, headers: { "content-length": "0" }, body: new Uint8Array() };
          }
        }
        if (parts.length === 4 && parts[0] === "media" && parts[1] === "resources" && parts[3] === "content" && (method === "GET" || method === "HEAD")) {
          exactQuery(request.query, []);
          const body = await browserMedia.content(parts[2]);
          return body ? rangedBinaryResponse(
            body.contentType,
            body.bytes,
            header(request, "range"),
            method === "HEAD"
          ) : notFound2();
        }
        if (parts.length === 3 && parts[0] === "media" && parts[1] === "assets" && (method === "GET" || method === "HEAD")) {
          exactQuery(request.query, []);
          const body = await createHostAssetRegistry(context).readMedia(parts[2]);
          return body ? rangedBinaryResponse(
            body.contentType,
            body.bytes,
            header(request, "range"),
            method === "HEAD"
          ) : notFound2();
        }
        if (method === "GET" && path === "assets") {
          const query = exactQuery(request.query, [
            "kind",
            "productionType",
            "sceneNodeId"
          ]);
          return jsonResponse(200, await service.listAssets(query));
        }
        if (method === "GET" && parts.length === 2 && parts[0] === "assets") {
          exactQuery(request.query, []);
          const id = getAssetIdFromArgs({ id: parts[1] });
          return jsonResponse(200, await service.getAsset(id));
        }
        if (method === "GET" && parts.length === 3 && parts[0] === "media" && parts[1] === "bundled") {
          exactQuery(request.query, []);
          const response = await bundledMediaResponse(
            parts[2],
            header(request, "range"),
            { resolveAsset: options.bundledMediaResolver }
          );
          if (response.status === 404) return notFound2();
          if (response.status === 416) {
            const normalized = jsonResponse(416, {
              ok: false,
              error: {
                code: "range_not_satisfiable",
                target: "wb-game-video",
                message: "Range Not Satisfiable",
                retryable: false
              }
            });
            return {
              ...normalized,
              headers: {
                ...normalized.headers,
                "accept-ranges": response.headers?.["accept-ranges"] ?? "bytes",
                "content-range": response.headers?.["content-range"] ?? "bytes */0"
              }
            };
          }
          return response;
        }
        if (method === "GET" && path === "style-axes") {
          exactQuery(request.query, []);
          return jsonResponse(200, {
            styleAxes: await getHostStyleAxes(context) ?? null
          });
        }
        if (method === "POST" && path === "style-axes") {
          exactQuery(request.query, []);
          const axes2 = jsonBody(request);
          if (!axes2 || typeof axes2 !== "object" || Array.isArray(axes2)) {
            throw new WbServiceInputError("styleAxes must be an object");
          }
          return jsonResponse(200, {
            styleAxes: await createHostAssetRegistry(context).setStyleAxes(
              axes2
            )
          });
        }
        if (method === "POST") {
          const serviceMethod = POST_ROUTES.get(path);
          if (serviceMethod) {
            exactQuery(request.query, []);
            return jsonResponse(
              200,
              await service[serviceMethod](jsonBody(request))
            );
          }
        }
        return notFound2();
      } catch (error) {
        if (error instanceof UploadConflictError) {
          return jsonResponse(409, {
            ok: false,
            error: {
              code: "upload_conflict",
              target: "wb-game-video",
              message: error.message,
              retryable: false
            }
          });
        }
        if (error instanceof WbServiceInputError) {
          return jsonResponse(400, {
            ok: false,
            error: {
              code: error.code,
              target: "wb-game-video",
              message: error.message,
              retryable: false
            }
          });
        }
        return jsonResponse(500, {
          ok: false,
          error: {
            code: "internal_error",
            target: "wb-game-video",
            message: "Internal Server Error",
            retryable: false
          }
        });
      }
    }
  };
}

// server/tool-handlers.ts
var getGraph = async (context, args) => createWbGameVideoService(context).getGraph(args);
var saveGraph = async (context, args) => createWbGameVideoService(context).saveGraph(args);
var listVideos = async (context, args) => createWbGameVideoService(context).listVideos(args);
var generateShotScript = async (context, args) => createWbGameVideoService(context).generateShotScript(args);
var generateKeyframe = async (context, args) => createWbGameVideoService(context).generateKeyframe(args);
var generateVideo = async (context, args) => createWbGameVideoService(context).generateVideo(args);
var generateNodeVideo = async (context, args) => createWbGameVideoService(context).generateNodeVideo(args);
var listAssets = async (context, args) => createWbGameVideoService(context).listAssets(args);
var getAsset = async (context, args) => createWbGameVideoService(context).getAsset(
  getAssetIdFromArgs(args)
);
var importCharacterRefs2 = async (context, args) => createWbGameVideoService(context).importCharacterRefs(args);
var importSceneRefs2 = async (context, args) => createWbGameVideoService(context).importSceneRefs(args);
var tools = {
  "wb-game-video:get-graph": getGraph,
  "wb-game-video:save-graph": saveGraph,
  "wb-game-video:list-videos": listVideos,
  "wb-game-video:generate-shot-script": generateShotScript,
  "wb-game-video:generate-keyframe": generateKeyframe,
  "wb-game-video:generate-video": generateVideo,
  "wb-game-video:generate-node-video": generateNodeVideo,
  "wb-game-video:list-assets": listAssets,
  "wb-game-video:get-asset": getAsset,
  "wb-game-video:import-character-refs": importCharacterRefs2,
  "wb-game-video:import-scene-refs": importSceneRefs2
};

// server/host.ts
var host = defineWorkbenchExtension({
  tools,
  gamePackage: {
    platform: "wb-game-video",
    createSeed: createNodiaSeed,
    async validateSeed(seed) {
      validateNodiaSeed(seed);
    }
  },
  createRouter: createWbGameVideoRouter
});
var host_default = host;
export {
  host_default as default,
  host,
  tools
};
//# sourceMappingURL=host.js.map