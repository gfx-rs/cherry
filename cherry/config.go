/*
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package cherry

import (
	"encoding/xml"
	"fmt"
	"os"
	"strings"
)

// Data types for importing dEQP-*-cases.xml

type TestCaseNode struct {
	Name		string			`xml:"Name,attr"`
	CaseType	string			`xml:"CaseType,attr"`
	Description	string			`xml:"Description,attr"`
	Children	[]TestCaseNode	`xml:"TestCase"`
}

type TestCaseTree struct {
	TestCases	[]TestCaseNode	`xml:"TestCase"`
	PackageName	string			`xml:"PackageName"`	// \note not actually from xml!
}

// Get linearized list of test case path from a TestCaseTree.

func (tree *TestCaseTree) GetLinearizedList () []string {
	list := []string{}

	var recurse func (node *TestCaseNode, prefix string)
	recurse = func (node *TestCaseNode, prefix string) {
		if node.CaseType == "TestGroup" {
			for _, child := range node.Children {
				recurse(&child, prefix + "." + node.Name)
			}
		} else {
			list = append(list, prefix + "." + node.Name)
		}
	}

	for _, node := range tree.TestCases {
		recurse(&node, tree.PackageName)
	}

	return list
}

// Data types for importing dEQP-*-TestSets.xml

type TestSet struct {
	Name		string			`xml:"Name,attr"`
	Filters		string			`xml:"TestNameFilters,attr"`
}

type TestSetList struct {
	TestSets	[]TestSet		`xml:"TestSet"`
}

type CandyConfig struct {
	TestSetList	TestSetList		`xml:"TestSets"`
}

// Import dEQP-*-cases.xml

func importTestCaseTree (fileName string, packageName string) (*TestCaseTree, error) {
	// Open file.
	xmlFile, err := os.Open(fileName)
	if err != nil { return nil, err }
	defer xmlFile.Close()

	// Init tree.
	tree := TestCaseTree{}
	tree.PackageName = packageName

	// Parse XML.
	decoder := xml.NewDecoder(xmlFile)
	err = decoder.Decode(&tree)
	if err != nil { return nil, err }

	// Return.
	return &tree, nil
}

// Import dEQP-*-TestSets.xml

func importTestSets (fileName string) (*TestSetList, error) {
	// Open file.
	xmlFile, err := os.Open(fileName)
	if err != nil { return nil, err }
	defer xmlFile.Close()

	// Parse XML.
	config := CandyConfig{}
	decoder := xml.NewDecoder(xmlFile)
	err = decoder.Decode(&config)
	if err != nil { return nil, err }

	// Return.
	return &config.TestSetList, nil
}

// Tests.

func printNode (indent int, node *TestCaseNode) {
	indentStr := strings.Repeat("  ", indent)
	fmt.Printf("%s%s\n", indentStr, node.Name)

	for _, child := range node.Children {
		printNode(indent+1, &child)
	}
}
