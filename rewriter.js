
function readFile(filename) {
  var content = "";
  var f = fs.open(filename, 'r');
  while (true) {
    var line = f.readLine();
    if (line.length === 0) {
      break;
    }
    content += line;
  }
  f.close();
  return content;
}

var dumper = {
  dump: function(s) {
    if (s) {
      return this[s.type](s);
    }
    else {
      return "";
    }
  },
  
  Program: function(s) {
    return s.body.map(this.dump, this).join("");
  },
  
  VariableDeclaration: function(s) {
    return "var " + s.declarations.map(this.dump, this).join("") + ";\n";
  },
  
  // statements
  
  BlockStatement: function(s) {
    return "{\n" + s.body.map(this.dump, this).join("") + "}";
  },
  
  ReturnStatement: function(s) {
    return "return " + this.dump(s.argument) + ";\n";
  },
  
  ForStatement: function(s) {
    var init = this.dump(s.init);
    var test = this.dump(s.test);
    var update = this.dump(s.update);
    var body = this.dump(s.body);
    return "for (" + init + ";" + test + ";" + update + ")" + body;
  },
  
  WhileStatement: function(s) {
    var test = this.dump(s.test);
    var body = this.dump(s.body);
    return "while (" + test + ")" + body;
  },
  
  IfStatement: function(s) {
    var test = this.dump(s.test);
    var consequent = this.dump(s.consequent);
    var alternate = this.dump(s.alternate);
    return "if (" + test + ")" + consequent + (alternate ? " else " + alternate : "");
  },
  
  BreakStatement: function(s) {
    return "break;\n";
  },
  
  ExpressionStatement: function(s) {
    return this.dump(s.expression) + ";\n";
  },
  
  // expressions
  
  AssignmentExpression: function(s) {
    return this.dump(s.left) + " " + s.operator + " " + this.dump(s.right);
  },
  
  BinaryExpression: function(s) {
    return "(" + this.dump(s.left) + " " + s.operator + " " + this.dump(s.right) + ")";
  },
  
  UnaryExpression: function(s) {
    return s.operator + " " + this.dump(s.argument);
  },
  
  SequenceExpression: function(s) {
    return s.expressions.map(this.dump, this).join(", ");
  },
  
  UpdateExpression: function(s) {
    if (s.prefix) {
      return s.operator + this.dump(s.argument);
    }
    else {
      return this.dump(s.argument) + s.operator;
    }
  },
  
  FunctionExpression: function(s) {
    var params = s.params.map(this.dump, this).join(", ");
    var body = this.dump(s.body);
    return "function " + (s.id || "") + "(" + params + ")" + body;
  },
  
  CallExpression: function(s) {
    var callee = this.dump(s.callee);
    var args = s.arguments.map(this.dump, this).join(", ");
    return callee + "(" + args + ")";
  },
  
  ConditionalExpression: function(s) {
    var test = this.dump(s.test);
    var consequent = this.dump(s.consequent);
    var alternate = this.dump(s.alternate);
    return test + "?" + consequent + " : " + alternate;
  },
  
  MemberExpression: function(s) {
    if (s.accesstype === "Dot") {
      return this.dump(s.object) + "." + this.dump(s.property);
    }
    else if (s.accesstype === "Bracket") {
      return this.dump(s.object) + "[" + this.dump(s.property) + "]";
    }
    else {
      system.print("ERROR: unknown accesstype " + s.accesstype);
      return "";
    }
  },
  
  ObjectExpression: function(s) {
    return "{" + s.properties.map(this.dump, this).join(", ") + "}";
  },
  
  Property: function(s) {
    return this.dump(s.key) + ": " + this.dump(s.value);
  },
  
  ThisExpression: function(s) {
    return "this";
  },
  
  Identifier: function(s) {
    return s.name;
  },
  
  Literal: function(s) {
    if (s.objtype === "String") {
      return '"' + s.value + '"';
    }
    else if (s.objtype === "Number") {
      return s.value;
    }
    else if (s.objtype === "Boolean") {
      return s.value ? "true" : "false";
    }
    else if (s.objtype === "RegEx") {
      return s.value;
    }
    else {
      system.print("ERROR: unknown objtype " + s.objtype);
      return "";
    }
  }
};

// A simple templating function
//
// Replaces placeholders in string, parses the string to AST and
// returns the first statement in AST.
function parseTemplate(tpl, data) {
  tpl = tpl.join("");
  for (var key in data) {
    tpl = tpl.replace(new RegExp("\{"+key+"}", "g"), data[key]);
  }
  return Reflect.parse(tpl).body[0];
}

var optimizer = {
  opt: function(s) {
    if (typeof s === "object" && s && this[s.type]) {
      return this[s.type](s);
    }
    else if (typeof s === "object" && s && s.length) {
      for (var i=0; i<s.length; i++) {
        s[i] = this.opt(s[i]);
      }
    }
    else if (typeof s === "object" && s) {
      for (i in s) {
        s[i] = this.opt(s[i]);
      }
    }
    return s;
  },
  
  // Returns unique variable name
  count: 0,
  getVar: function(prefix) {
    this.count++;
    return "$" + prefix + this.count;
  },
  
  CallExpression: function(s) {
    if (this.isForEach(s)) {
      var fn = s.arguments[0];
      
      var forStatement = parseTemplate([
        "for (var {i}=0, {len}={array}.length; {i}<{len}; {i}++) {",
          "var {param} = {array}[{i}];",
        "}"
      ], {
        i: this.getVar("i"),
        len: this.getVar("len"),
        param: fn.params[0].name,
        array: dumper.dump(s.callee.object)
      });
      
      // recursively also optimize the loop body
      var loopBody = this.opt(fn.body.body);
      // and append it to for-statement body
      forStatement.body.body = forStatement.body.body.concat(loopBody);
      
      return forStatement;
    }
    else {
      this.opt(s.callee);
      this.opt(s.arguments);
      return s;
    }
  },
  
  // tests if expression is a forEach MemberExpression
  // + first argument must be function
  // + second argument is wither "this" or nothing.
  isForEach: function(s) {
    var c = s.callee;
    var fn = s.arguments[0];
    var scope = s.arguments[1];
    return c.type === "MemberExpression" &&
           c.property.type == "Identifier" &&
           c.property.name === "forEach" &&
           fn && fn.type === "FunctionExpression" &&
           (!scope || scope.type === "ThisExpression");
  }
};

system.args.forEach(function(filename, i) {
  // ignore first argument (the script name itself)
  if (i===0) return;
  
  var code = Reflect.parse(readFile(filename));
  code = optimizer.opt(code);
  system.print(dumper.dump(code));
});
